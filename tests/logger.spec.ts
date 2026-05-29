import { describe, expect, it } from "vitest";
import type { PluginLogger } from "../src/logger.js";
import { noopLogger } from "../src/logger.js";

describe("PluginLogger", () => {
  it("noopLogger does not throw", () => {
    expect(() => noopLogger.info("test")).not.toThrow();
    expect(() => noopLogger.warn("test", { err: new Error("x") })).not.toThrow();
    expect(() => noopLogger.error("test", { err: new Error("x") })).not.toThrow();
  });
});
