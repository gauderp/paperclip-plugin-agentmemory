import { describe, expect, it, vi } from "vitest";
import { handleRecall } from "../src/tools/recall.js";
import { handleObserve } from "../src/tools/observe.js";
import { handleSearch } from "../src/tools/search.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";

function mockClient(overrides: Partial<AgentmemoryClient> = {}): AgentmemoryClient {
  return {
    smartSearch: vi.fn(async () => [
      { content: "prior decision about caching", score: 0.95, source: "crystal-1" },
      { content: "auth pattern uses JWT", score: 0.80, source: "obs-42" },
    ]),
    observe: vi.fn(async () => ({ stored: true, id: "obs-new" })),
    createSketch: vi.fn(async () => ({ id: "sk-new" })),
    ...overrides,
  } as unknown as AgentmemoryClient;
}

describe("memory-recall tool", () => {
  it("returns context string and token count within budget", async () => {
    const client = mockClient();
    const result = await handleRecall(client, {
      query: "how does caching work?",
      maxTokens: 50_000,
    });

    expect(result.context).toContain("prior decision about caching");
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeLessThanOrEqual(50_000);
    expect(result.sources).toEqual(["crystal-1", "obs-42"]);
  });

  it("respects maxTokens budget", async () => {
    const client = mockClient({
      smartSearch: vi.fn(async () => [
        { content: "a".repeat(2000), score: 0.9, source: "s1" },
        { content: "b".repeat(2000), score: 0.8, source: "s2" },
      ]),
    });

    const result = await handleRecall(client, { query: "test", maxTokens: 600 });
    expect(result.sources).toHaveLength(1);
  });
});

describe("memory-observe tool", () => {
  it("stores observation and creates sketch", async () => {
    const client = mockClient();
    const result = await handleObserve(client, {
      observation: "caching layer needs TTL",
      category: "discovery",
    });

    expect(result.stored).toBe(true);
    expect(result.id).toBe("obs-new");
    expect(client.observe).toHaveBeenCalled();
    expect(client.createSketch).toHaveBeenCalled();
  });

  it("passes project when provided", async () => {
    const client = mockClient();
    await handleObserve(client, {
      observation: "test",
      category: "decision",
      project: "my-proj",
    });

    expect(client.observe).toHaveBeenCalledWith("test", "decision", "my-proj");
  });
});

describe("memory-search tool", () => {
  it("returns discrete results with scores", async () => {
    const client = mockClient();
    const result = await handleSearch(client, { query: "JWT pattern", limit: 5 });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].score).toBe(0.95);
    expect(client.smartSearch).toHaveBeenCalledWith("JWT pattern", 5, undefined);
  });

  it("defaults limit to 10", async () => {
    const client = mockClient();
    await handleSearch(client, { query: "test" });

    expect(client.smartSearch).toHaveBeenCalledWith("test", 10, undefined);
  });
});
