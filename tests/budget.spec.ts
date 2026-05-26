import { describe, expect, it } from "vitest";
import {
  calculateBudget,
  truncateToTokenBudget,
  estimateTokens,
} from "../src/budget.js";

describe("budget engine", () => {
  describe("calculateBudget", () => {
    it("calculates available budget from window and percent", () => {
      const budget = calculateBudget(128_000, 40);
      // 128000 * 0.40 = 51200 - 3000 overhead = 48200
      expect(budget).toBe(48_200);
    });

    it("clamps percent between 1 and 100", () => {
      expect(calculateBudget(128_000, 0)).toBe(calculateBudget(128_000, 1));
      expect(calculateBudget(128_000, 150)).toBe(calculateBudget(128_000, 100));
    });

    it("returns at least 0", () => {
      expect(calculateBudget(100, 1)).toBe(0);
    });
  });

  describe("estimateTokens", () => {
    it("estimates tokens as length / 4", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 / 4 = 2.75 → 3
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("truncateToTokenBudget", () => {
    it("returns all results within budget", () => {
      const results = [
        { content: "a".repeat(100), score: 0.9, source: "s1" },
        { content: "b".repeat(100), score: 0.8, source: "s2" },
      ];
      const { items, tokenCount } = truncateToTokenBudget(results, 100);
      expect(items).toHaveLength(2);
      expect(tokenCount).toBe(50);
    });

    it("truncates when exceeding budget", () => {
      const results = [
        { content: "a".repeat(400), score: 0.9, source: "s1" },
        { content: "b".repeat(400), score: 0.8, source: "s2" },
      ];
      const { items, tokenCount } = truncateToTokenBudget(results, 120);
      expect(items).toHaveLength(1);
      expect(tokenCount).toBe(100);
    });

    it("returns empty for zero budget", () => {
      const results = [{ content: "hello", score: 1, source: "s" }];
      const { items, tokenCount } = truncateToTokenBudget(results, 0);
      expect(items).toHaveLength(0);
      expect(tokenCount).toBe(0);
    });
  });
});
