import type { AgentmemoryClient } from "../agentmemory-client.js";

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
): Promise<ObserveOutput> {
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, input.project),
    client.createSketch(input.observation, input.category),
  ]);

  return { stored: obsResult.stored, id: obsResult.id };
}
