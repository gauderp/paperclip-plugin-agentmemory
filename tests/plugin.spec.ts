import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_BASE_URL, HEALTH_PATH } from "../src/constants.js";

const COMPANY_ID = "co-test-1";

describe("agentmemory connector plugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares connector capabilities and UI slots", () => {
    expect(manifest.categories).toContain("connector");
    expect(manifest.capabilities).toContain("http.outbound");
    expect(manifest.capabilities).toContain("instance.settings.register");
    expect(manifest.ui?.slots?.some((slot) => slot.type === "settingsPage")).toBe(true);
  });

  it("stores and reads company-scoped settings", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const saved = await harness.performAction<{ settings: { baseUrl: string; memoryNamespace: string } }>(
      "save-company-settings",
      {
        companyId: COMPANY_ID,
        settings: { baseUrl: "http://127.0.0.1:3111", memoryNamespace: "acme" },
      },
    );

    expect(saved.settings.baseUrl).toBe("http://127.0.0.1:3111");
    expect(saved.settings.memoryNamespace).toBe("acme");

    const loaded = await harness.performAction<{ baseUrl: string; memoryNamespace: string }>(
      "get-company-settings",
      { companyId: COMPANY_ID },
    );
    expect(loaded.memoryNamespace).toBe("acme");
  });

  it("probes agentmemory health via http.outbound", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "healthy", service: "agentmemory" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("save-company-settings", {
      companyId: COMPANY_ID,
      settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID },
    });

    const health = await harness.performAction<{ status: string; httpStatus: number }>("probe-health", {
      companyId: COMPANY_ID,
    });

    expect(health.status).toBe("ok");
    expect(health.httpStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_BASE_URL}${HEALTH_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("reports error when agentmemory is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const health = await harness.performAction<{ status: string }>("probe-health", {
      companyId: COMPANY_ID,
    });

    expect(health.status).toBe("error");
  });
});
