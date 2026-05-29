import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type ForgetInput = {
  memoryId: string;
  reason?: string;
};

export type ForgetOutput = {
  forgotten: boolean;
};

export async function handleForget(
  client: AgentmemoryClient,
  input: ForgetInput,
  activity: ActivityLogger = noopActivity,
): Promise<ForgetOutput> {
  const result = await client.forget(input.memoryId);

  await activity.log({
    message: `Forgot memory ${input.memoryId}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: { memoryId: input.memoryId, reason: input.reason },
  });

  return { forgotten: result.forgotten };
}
