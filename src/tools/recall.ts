import type { AgentmemoryClient } from "../agentmemory-client.js";
import { truncateToTokenBudget } from "../budget.js";

export type RecallInput = {
  query: string;
  project?: string;
  maxTokens?: number;
};

export type RecallOutput = {
  context: string;
  tokenCount: number;
  sources: string[];
};

export async function handleRecall(
  client: AgentmemoryClient,
  input: RecallInput,
): Promise<RecallOutput> {
  const maxTokens = input.maxTokens ?? 48_200;
  const rawResults = await client.smartSearch(input.query, 50, input.project);

  const scored = rawResults.map((r) => ({
    content: r.content,
    score: r.score,
    source: r.source ?? "unknown",
  }));

  const { items, tokenCount } = truncateToTokenBudget(scored, maxTokens);

  const context = items.map((item) => item.content).join("\n\n---\n\n");
  const sources = items.map((item) => item.source);

  return { context, tokenCount, sources };
}
