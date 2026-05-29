import { describe, expect, it, vi } from "vitest";
import { handleRecall } from "../src/tools/recall.js";
import { handleObserve } from "../src/tools/observe.js";
import { handleSearch } from "../src/tools/search.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

function mockClient(overrides: Partial<AgentmemoryClient> = {}): AgentmemoryClient {
  return {
    smartSearch: vi.fn(async () => [
      { content: "scoped result", score: 0.9, source: "s1" },
    ]),
    observe: vi.fn(async () => ({ stored: true, id: "obs-1" })),
    createSketch: vi.fn(async () => ({ id: "sk-1" })),
    ...overrides,
  } as unknown as AgentmemoryClient;
}

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("scoped memory", () => {
  describe("recall", () => {
    it("uses runCtx.projectId when no explicit project", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleRecall(client, { query: "test", maxTokens: 50_000 }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 50, "proj-1");
    });

    it("prefers explicit project over runCtx", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleRecall(client, { query: "test", project: "explicit", maxTokens: 50_000 }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 50, "explicit");
    });
  });

  describe("observe", () => {
    it("auto-tags with runCtx.projectId", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleObserve(client, { observation: "test", category: "discovery" }, activity, { projectId: "proj-1" });

      expect(client.observe).toHaveBeenCalledWith("test", "discovery", "proj-1");
    });
  });

  describe("search", () => {
    it("uses runCtx.projectId when no explicit project", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleSearch(client, { query: "test" }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 10, "proj-1");
    });

    it("searches globally with project '*'", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleSearch(client, { query: "test", project: "*" }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 10, undefined);
    });
  });
});
