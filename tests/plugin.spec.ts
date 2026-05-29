import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_BASE_URL, HEALTH_PATH, TOOL_KEYS, SKILL_KEY, REFLECTION_SKILL_KEY, CURATOR_AGENT_KEY, JOB_KEYS } from "../src/constants.js";
import { resolveToken } from "../src/settings.js";

const COMPANY_ID = "co-test-1";

describe("agentmemory plugin v0.4", () => {
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
    expect(manifest.capabilities).toContain("companies.read");
  });

  it("declares 4 tools in manifest", () => {
    expect(manifest.tools).toHaveLength(4);
    const toolNames = manifest.tools!.map((t: any) => t.name);
    expect(toolNames).toContain(TOOL_KEYS.recall);
    expect(toolNames).toContain(TOOL_KEYS.observe);
    expect(toolNames).toContain(TOOL_KEYS.search);
    expect(toolNames).toContain(TOOL_KEYS.forget);
  });

  it("declares 2 managed skills", () => {
    expect(manifest.skills).toHaveLength(2);
    const keys = (manifest.skills as any[]).map((s: any) => s.skillKey);
    expect(keys).toContain(SKILL_KEY);
    expect(keys).toContain(REFLECTION_SKILL_KEY);
  });

  it("declares curator agent", () => {
    expect(manifest.agents).toHaveLength(1);
    expect((manifest.agents as any[])[0].agentKey).toBe(CURATOR_AGENT_KEY);
  });

  it("declares curator job in manifest", () => {
    expect(manifest.jobs).toBeDefined();
    const jobs = manifest.jobs as any[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobKey).toBe(JOB_KEYS.curatorCycle);
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

  it("declares secrets.read-ref capability", () => {
    expect(manifest.capabilities).toContain("secrets.read-ref");
  });

  it("declares events.emit capability", () => {
    expect(manifest.capabilities).toContain("events.emit");
  });

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

describe("secret token resolution", () => {
  it("returns plain-text token as-is", async () => {
    const result = await resolveToken("my-plain-token");
    expect(result).toBe("my-plain-token");
  });

  it("returns undefined for empty token", async () => {
    const result = await resolveToken(undefined);
    expect(result).toBeUndefined();
  });

  it("resolves secret: prefixed token via resolver", async () => {
    const resolver = vi.fn(async (_ref: string) => "resolved-secret-value");
    const result = await resolveToken("secret:my-secret", resolver);
    expect(resolver).toHaveBeenCalledWith("my-secret");
    expect(result).toBe("resolved-secret-value");
  });

  it("falls back to raw value if resolver fails", async () => {
    const resolver = vi.fn(async () => { throw new Error("not found"); });
    const result = await resolveToken("secret:bad-ref", resolver);
    expect(result).toBe("secret:bad-ref");
  });
});
