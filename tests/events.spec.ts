import { describe, expect, it, vi } from "vitest";
import { createMemoryEventEmitter } from "../src/events.js";

describe("MemoryEventEmitter", () => {
  it("emits memory.recalled with payload", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.recalled("co-1", { tokenCount: 500, resultsCount: 3, project: "proj-1" });

    expect(emit).toHaveBeenCalledWith("memory.recalled", "co-1", {
      tokenCount: 500, resultsCount: 3, project: "proj-1",
    });
  });

  it("emits memory.recall.empty when resultsCount is 0", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.recalled("co-1", { tokenCount: 0, resultsCount: 0, project: "proj-1" });

    expect(emit).toHaveBeenCalledWith("memory.recall.empty", "co-1", {
      query: undefined, project: "proj-1",
    });
  });

  it("emits memory.observed with category", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.observed("co-1", { category: "failure", project: "proj-1", memoryId: "obs-1" });
    expect(emit).toHaveBeenCalledWith("memory.observed", "co-1", {
      category: "failure", project: "proj-1", memoryId: "obs-1",
    });
  });

  it("emits memory.forgotten", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.forgotten("co-1", { memoryId: "obs-1", reason: "outdated" });
    expect(emit).toHaveBeenCalledWith("memory.forgotten", "co-1", {
      memoryId: "obs-1", reason: "outdated",
    });
  });

  it("emits memory.consolidated", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.consolidated("co-1", { consolidated: 5, compressed: 2, forgotten: 1, discarded: 3 });
    expect(emit).toHaveBeenCalledWith("memory.consolidated", "co-1", {
      consolidated: 5, compressed: 2, forgotten: 1, discarded: 3,
    });
  });

  it("does not throw if emit fails", async () => {
    const emit = vi.fn(async () => { throw new Error("emit failed"); });
    const emitter = createMemoryEventEmitter(emit);

    await expect(emitter.recalled("co-1", { tokenCount: 0, resultsCount: 0 })).resolves.not.toThrow();
  });
});
