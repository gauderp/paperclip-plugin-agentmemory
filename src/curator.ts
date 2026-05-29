import type { PluginContext } from "@paperclipai/plugin-sdk";
import { CURATOR_AGENT_KEY } from "./constants.js";
import { AgentmemoryClient } from "./agentmemory-client.js";
import type { AgentmemoryFullSettings } from "./settings.js";
import type { PluginLogger } from "./logger.js";
import { noopLogger } from "./logger.js";

export const CURATOR_DISPLAY_NAME = "Memory Curator";
export const CURATOR_ROLE = "memory-maintenance";
export const CURATOR_TITLE = "Memory Curator Agent";
export const CURATOR_CAPABILITIES =
  "Consolidates observations into crystals, compresses history, cleans expired data, maintains knowledge graph.";

export const CURATOR_INSTRUCTIONS = `# Memory Curator

You maintain the memory base clean and useful. You run automatically on a schedule and after issues are completed.

## Periodic routine
1. List unconsolidated observations from the last 7 days
2. Group by project and category
3. Consolidate groups with 5+ observations into crystals
4. Extract entities/relations for the knowledge graph (if enabled)
5. Apply auto-forget on observations older than the configured threshold that are already consolidated
6. Garbage-collect sketches not promoted within the configured TTL

## After issue completed
1. Consolidate observations from the issue into a summary crystal
2. Promote relevant sketches to permanent memory
3. Discard irrelevant sketches

## Rules
- NEVER delete user manual memories
- Consolidate, don't erase — compressed information is better than lost information
- Prioritize "failure" and "decision" crystals (they have the highest value for future work)
- Log what you consolidated and cleaned for auditability
`;

export async function reconcileCurator(ctx: PluginContext, companyId: string): Promise<void> {
  await ctx.agents.managed.reconcile(CURATOR_AGENT_KEY, companyId);
}

export async function reconcileCuratorAllCompanies(ctx: PluginContext): Promise<void> {
  const companies = await ctx.companies.list();
  for (const company of companies) {
    await reconcileCurator(ctx, company.id);
  }
}

export function createClientFromSettings(
  ctx: PluginContext,
  settings: AgentmemoryFullSettings,
): AgentmemoryClient {
  return new AgentmemoryClient(
    ctx.http,
    settings.baseUrl,
    settings.memoryNamespace,
    settings.bearerToken,
  );
}

export async function runCuratorJob(
  client: AgentmemoryClient,
  settings: AgentmemoryFullSettings,
  logger: PluginLogger = noopLogger,
): Promise<{ consolidated: number; compressed: number; forgotten: number; discarded: number; extracted: number }> {
  const [consolidateResult, compressResult, forgetResult, gcResult] = await Promise.all([
    client.consolidate().catch((err) => { logger.warn("consolidate failed", { err }); return { consolidated: 0 }; }),
    client.flowCompress().catch((err) => { logger.warn("flowCompress failed", { err }); return { compressed: 0 }; }),
    client.autoForget(settings.autoForgetDays).catch((err) => { logger.warn("autoForget failed", { err }); return { forgotten: 0 }; }),
    client.sketchesGc(settings.sketchTTLDays).catch((err) => { logger.warn("sketchesGc failed", { err }); return { discarded: 0 }; }),
  ]);

  let extracted = 0;
  if (settings.enableKnowledgeGraph) {
    const graphResult = await client.graphExtract().catch((err) => { logger.warn("graphExtract failed", { err }); return { extracted: 0 }; });
    extracted = graphResult.extracted;
  }

  await client.autoCrystallize().catch((err) => { logger.warn("autoCrystallize failed", { err }); });

  return {
    consolidated: consolidateResult.consolidated,
    compressed: compressResult.compressed,
    forgotten: forgetResult.forgotten,
    discarded: gcResult.discarded,
    extracted,
  };
}
