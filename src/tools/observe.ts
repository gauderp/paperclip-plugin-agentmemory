import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

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

export async function handleObserve(
  client: AgentmemoryClient,
  input: ObserveInput,
  activity: ActivityLogger = noopActivity,
): Promise<ObserveOutput> {
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, input.project),
    client.createSketch(input.observation, input.category),
  ]);

  const truncated = input.observation.length > 80
    ? input.observation.slice(0, 77) + "..."
    : input.observation;

  await activity.log({
    message: `Observed ${input.category}: ${truncated}`,
    metadata: { category: input.category, project: input.project, memoryId: obsResult.id },
  });

  return { stored: obsResult.stored, id: obsResult.id };
}
