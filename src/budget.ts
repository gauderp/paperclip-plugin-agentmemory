import { TOOL_OVERHEAD_TOKENS, CHARS_PER_TOKEN } from "./constants.js";

export function calculateBudget(contextWindowSize: number, memoryBudgetPercent: number): number {
  const pct = Math.max(1, Math.min(100, memoryBudgetPercent));
  const maxTokens = Math.floor(contextWindowSize * (pct / 100));
  return Math.max(0, maxTokens - TOOL_OVERHEAD_TOKENS);
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type BudgetItem = { content: string; score: number; source: string };

export function truncateToTokenBudget(
  results: BudgetItem[],
  maxTokens: number,
): { items: BudgetItem[]; tokenCount: number } {
  const items: BudgetItem[] = [];
  let tokenCount = 0;

  for (const result of results) {
    const tokens = estimateTokens(result.content);
    if (tokenCount + tokens > maxTokens) break;
    items.push(result);
    tokenCount += tokens;
  }

  return { items, tokenCount };
}
