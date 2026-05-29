import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger, RunScope } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type ObserveInput = {
  observation: string;
  category: "decision" | "discovery" | "pattern" | "failure";
  project?: string;
};

export type ObserveOutput = {
  stored: boolean;
  id: string;
};

export type ObserveStateTracker = {
  incrementObserveCount(runId: string): Promise<void>;
};

export async function handleObserve(
  client: AgentmemoryClient,
  input: ObserveInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
  stateTracker?: ObserveStateTracker,
): Promise<ObserveOutput> {
  const project = input.project ?? scope.projectId;
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, project),
    client.createSketch(input.observation, input.category),
  ]);

  // Track manual observe count for deduplication with auto-observe
  if (stateTracker && scope.runId) {
    await stateTracker.incrementObserveCount(scope.runId).catch(() => {});
  }

  const truncated = input.observation.length > 80
    ? input.observation.slice(0, 77) + "..."
    : input.observation;

  await activity.log({
    message: `Observed ${input.category}: ${truncated}`,
    metadata: { category: input.category, project, memoryId: obsResult.id },
  });

  return { stored: obsResult.stored, id: obsResult.id };
}
