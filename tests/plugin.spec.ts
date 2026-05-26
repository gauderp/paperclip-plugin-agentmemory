import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_BASE_URL, HEALTH_PATH, TOOL_KEYS, SKILL_KEY, CURATOR_AGENT_KEY } from "../src/constants.js";

const COMPANY_ID = "co-test-1";

describe("agentmemory plugin v0.2", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares connector capabilities including tools, agents, skills", () => {
    expect(manifest.categories).toContain("connector");
    expect(manifest.capabilities).toContain("http.outbound");
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect(manifest.capabilities).toContain("agents.managed");
    expect(manifest.capabilities).toContain("skills.managed");
    expect(manifest.capabilities).toContain("jobs.schedule");
    expect(manifest.capabilities).toContain("events.subscribe");
    expect(manifest.capabilities).toContain("instance.settings.register");
  });

  it("declares 3 tools in manifest", () => {
    expect(manifest.tools).toHaveLength(3);
    const toolNames = manifest.tools!.map((t: any) => t.name);
    expect(toolNames).toContain(TOOL_KEYS.recall);
    expect(toolNames).toContain(TOOL_KEYS.observe);
    expect(toolNames).toContain(TOOL_KEYS.search);
  });

  it("declares managed skill", () => {
    expect(manifest.skills).toHaveLength(1);
    expect((manifest.skills as any[])[0].skillKey).toBe(SKILL_KEY);
  });

  it("declares curator agent", () => {
    expect(manifest.agents).toHaveLength(1);
    expect((manifest.agents as any[])[0].agentKey).toBe(CURATOR_AGENT_KEY);
  });

  it("uses company-scoped state for settings (no instanceConfigSchema)", () => {
    // Settings are managed via plugin state, not instanceConfigSchema
    expect((manifest as any).instanceConfigSchema).toBeUndefined();
  });

  it("declares 3 UI slots (health widget, stats widget, settings)", () => {
    const slots = manifest.ui?.slots ?? [];
    expect(slots).toHaveLength(3);
    const types = slots.map((s) => s.type);
    expect(types.filter((t) => t === "dashboardWidget")).toHaveLength(2);
    expect(types).toContain("settingsPage");
  });

  it("probes agentmemory health via http.outbound", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "healthy", service: "agentmemory" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities, "companies.read"] });
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
  }, 10000);

  it("reports error when agentmemory is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities, "companies.read"] });
    await plugin.definition.setup(harness.ctx);

    const health = await harness.performAction<{ status: string }>("probe-health", {
      companyId: COMPANY_ID,
    });

    expect(health.status).toBe("error");
  }, 10000);
});
