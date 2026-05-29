import type { AgentmemoryClient } from "../agentmemory-client.js";
import { truncateToTokenBudget } from "../budget.js";

export type ActivityLogger = {
  log(entry: { message: string; metadata?: Record<string, unknown> }): Promise<void>;
};

export type RunScope = {
  projectId?: string;
};

const noopActivity: ActivityLogger = { log: async () => {} };

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
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
): Promise<RecallOutput> {
  const project = input.project ?? scope.projectId;
  const maxTokens = input.maxTokens ?? 48_200;
  const rawResults = await client.smartSearch(input.query, 50, project);

  const scored = rawResults.map((r) => ({
    content: r.content,
    score: r.score,
    source: r.source ?? "unknown",
  }));

  const { items, tokenCount } = truncateToTokenBudget(scored, maxTokens);

  const context = items.map((item) => item.content).join("\n\n---\n\n");
  const sources = items.map((item) => item.source);

  await activity.log({
    message: `Recalled ${items.length} memories (${tokenCount} tokens)${project ? ` for project ${project}` : ""}`,
    metadata: { tokenCount, resultCount: items.length, project },
  });

  return { context, tokenCount, sources };
}
