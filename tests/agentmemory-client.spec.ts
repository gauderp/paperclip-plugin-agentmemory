import { describe, expect, it, vi } from "vitest";
import { AgentmemoryClient } from "../src/agentmemory-client.js";

function mockHttp(responseBody: unknown, status = 200) {
  return {
    fetch: vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(responseBody),
      json: async () => responseBody,
    })),
  };
}

describe("AgentmemoryClient", () => {
  it("smartSearch sends POST with query and returns results", async () => {
    const http = mockHttp({ results: [{ content: "foo", score: 0.9 }] });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "test-ns");

    const results = await client.smartSearch("find bugs", 10);

    expect(http.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3111/agentmemory/smart-search",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("find bugs"),
      }),
    );
    expect(results).toEqual([{ content: "foo", score: 0.9 }]);
  });

  it("observe sends POST with observation data", async () => {
    const http = mockHttp({ id: "obs-1", stored: true });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "test-ns");

    const result = await client.observe("cache invalidation is tricky", "discovery", "my-project");

    expect(http.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3111/agentmemory/observe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.stored).toBe(true);
  });

  it("includes bearer token in headers when provided", async () => {
    const http = mockHttp({ results: [] });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns", "my-secret");

    await client.smartSearch("test", 5);

    const fetchCall = http.fetch.mock.calls[0];
    expect(fetchCall[1].headers.Authorization).toBe("Bearer my-secret");
  });

  it("createSketch sends POST to sketches endpoint", async () => {
    const http = mockHttp({ id: "sk-1" });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns");

    const result = await client.createSketch("potential pattern found", "pattern");

    expect(http.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3111/agentmemory/sketches",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.id).toBe("sk-1");
  });

  it("consolidate sends POST to consolidate endpoint", async () => {
    const http = mockHttp({ consolidated: 5 });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns");

    const result = await client.consolidate("my-project");
    expect(result.consolidated).toBe(5);
  });

  it("graphStats sends GET to graph/stats endpoint", async () => {
    const http = mockHttp({ nodes: 42, edges: 100 });
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns");

    const stats = await client.graphStats();
    expect(stats.nodes).toBe(42);
  });

  it("throws on non-ok response", async () => {
    const http = mockHttp({ error: "not found" }, 404);
    const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns");

    await expect(client.smartSearch("test", 5)).rejects.toThrow("agentmemory responded 404");
  });
});
