import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_BASE_URL } from "../src/constants.js";

const COMPANY_ID = "co-test-1";

describe("automation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-recalls on agent.run.started and caches in run state", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("smart-search")) {
        return new Response(
          JSON.stringify({
            results: [{ content: "cached context", score: 0.9, source: "s1" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (typeof url === "string" && url.includes("health")) {
        return new Response(JSON.stringify({ status: "healthy" }), { status: 200 });
      }
      // issues.get mock — harness handles this via seed
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "companies.read"],
    });
    harness.seed({
      companies: [{ id: COMPANY_ID, name: "Test Co" }],
      issues: [
        {
          id: "issue-1",
          companyId: COMPANY_ID,
          title: "Fix login bug",
          description: "Users can't login",
        } as any,
      ],
    });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("save-company-settings", {
      companyId: COMPANY_ID,
      settings: {
        baseUrl: DEFAULT_BASE_URL,
        memoryNamespace: COMPANY_ID,
        enableAutoRecall: true,
      },
    });

    await harness.emit(
      "agent.run.started",
      { runId: "run-1", agentId: "agent-1", projectId: "proj-1", issueId: "issue-1" },
      { companyId: COMPANY_ID, entityId: "run-1", entityType: "agent_run" },
    );

    // Verify auto-recall was cached in run state
    const cached = harness.getState({
      scopeKind: "run",
      scopeId: "run-1",
      stateKey: "memory.autoRecall",
    });
    expect(cached).toBeDefined();
    expect((cached as any).context).toContain("cached context");
  }, 15000);

  it("skips auto-recall when setting is disabled", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "companies.read"],
    });
    harness.seed({ companies: [{ id: COMPANY_ID, name: "Test Co" }] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("save-company-settings", {
      companyId: COMPANY_ID,
      settings: {
        baseUrl: DEFAULT_BASE_URL,
        memoryNamespace: COMPANY_ID,
        enableAutoRecall: false,
      },
    });

    await harness.emit(
      "agent.run.started",
      { runId: "run-1", agentId: "agent-1" },
      { companyId: COMPANY_ID, entityId: "run-1", entityType: "agent_run" },
    );

    // smart-search should NOT have been called
    const searchCalls = fetchMock.mock.calls.filter(
      (c: any) => typeof c[0] === "string" && c[0].includes("smart-search"),
    );
    expect(searchCalls).toHaveLength(0);
  }, 10000);
});
