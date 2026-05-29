import { describe, expect, it, vi } from "vitest";
import { handleRecall } from "../src/tools/recall.js";
import { handleObserve } from "../src/tools/observe.js";
import { handleSearch } from "../src/tools/search.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

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

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("memory-recall tool", () => {
  it("returns context string and token count within budget", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleRecall(client, {
      query: "how does caching work?",
      maxTokens: 50_000,
    }, activity);

    expect(result.context).toContain("prior decision about caching");
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeLessThanOrEqual(50_000);
    expect(result.sources).toEqual(["crystal-1", "obs-42"]);
  });

  it("logs activity with result count and token count", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleRecall(client, { query: "caching", maxTokens: 50_000 }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Recalled 2 memories") }),
    );
  });

  it("respects maxTokens budget", async () => {
    const client = mockClient({
      smartSearch: vi.fn(async () => [
        { content: "a".repeat(2000), score: 0.9, source: "s1" },
        { content: "b".repeat(2000), score: 0.8, source: "s2" },
      ]),
    });
    const activity = mockActivity();
    const result = await handleRecall(client, { query: "test", maxTokens: 600 }, activity);
    expect(result.sources).toHaveLength(1);
  });
});

describe("memory-observe tool", () => {
  it("stores observation and creates sketch", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleObserve(client, {
      observation: "caching layer needs TTL",
      category: "discovery",
    }, activity);

    expect(result.stored).toBe(true);
    expect(result.id).toBe("obs-new");
    expect(client.observe).toHaveBeenCalled();
    expect(client.createSketch).toHaveBeenCalled();
  });

  it("logs activity with category and observation", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleObserve(client, {
      observation: "caching layer needs TTL",
      category: "discovery",
    }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("discovery") }),
    );
  });

  it("passes project when provided", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleObserve(client, {
      observation: "test",
      category: "decision",
      project: "my-proj",
    }, activity);

    expect(client.observe).toHaveBeenCalledWith("test", "decision", "my-proj");
  });
});

describe("memory-search tool", () => {
  it("returns discrete results with scores", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleSearch(client, { query: "JWT pattern", limit: 5 }, activity);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].score).toBe(0.95);
    expect(client.smartSearch).toHaveBeenCalledWith("JWT pattern", 5, undefined);
  });

  it("logs activity with query and result count", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleSearch(client, { query: "JWT pattern" }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("JWT pattern") }),
    );
  });

  it("defaults limit to 10", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleSearch(client, { query: "test" }, activity);

    expect(client.smartSearch).toHaveBeenCalledWith("test", 10, undefined);
  });
});
