import { describe, expect, it, vi } from "vitest";
import { handleForget } from "../src/tools/forget.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

function mockClient(): AgentmemoryClient {
  return {
    forget: vi.fn(async () => ({ forgotten: true })),
  } as unknown as AgentmemoryClient;
}

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("memory-forget tool", () => {
  it("calls client.forget with memoryId", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleForget(client, { memoryId: "obs-42" }, activity);

    expect(client.forget).toHaveBeenCalledWith("obs-42");
    expect(result.forgotten).toBe(true);
  });

  it("logs activity with memoryId and reason", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleForget(client, { memoryId: "obs-42", reason: "outdated info" }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("obs-42"),
        metadata: expect.objectContaining({ reason: "outdated info" }),
      }),
    );
  });

  it("works without reason", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleForget(client, { memoryId: "obs-1" }, activity);
    expect(result.forgotten).toBe(true);
  });
});
