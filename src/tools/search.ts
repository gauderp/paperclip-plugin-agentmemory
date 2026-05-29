import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type SearchInput = {
  query: string;
  project?: string;
  limit?: number;
};

export type SearchOutput = {
  results: Array<{ content: string; score: number; source: string }>;
};

export async function handleSearch(
  client: AgentmemoryClient,
  input: SearchInput,
  activity: ActivityLogger = noopActivity,
): Promise<SearchOutput> {
  const limit = input.limit ?? 10;
  const rawResults = await client.smartSearch(input.query, limit, input.project);

  const results = rawResults.map((r) => ({
    content: r.content,
    score: r.score,
    source: r.source ?? "unknown",
  }));

  await activity.log({
    message: `Searched memory for '${input.query}' — ${results.length} results`,
    metadata: { query: input.query, resultCount: results.length, project: input.project },
  });

  return { results };
}
