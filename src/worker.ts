import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { probeAgentmemory, workerHealthDiagnostics } from "./health.js";
import {
  readCompanySettings,
  requireCompanyId,
  writeCompanySettings,
  resolveToken,
  type AgentmemoryFullSettings,
} from "./settings.js";
import { calculateBudget } from "./budget.js";
import { AgentmemoryClient } from "./agentmemory-client.js";
import { handleRecall, type ActivityLogger, type RecallCache, type RecallOutput } from "./tools/recall.js";
import { handleObserve, type ObserveStateTracker } from "./tools/observe.js";
import { handleSearch } from "./tools/search.js";
import { handleForget } from "./tools/forget.js";
import { reconcileSkill } from "./skill.js";
import { reconcileCurator, runCuratorJob } from "./curator.js";
import { TOOL_KEYS, JOB_KEYS } from "./constants.js";
import type { PluginLogger } from "./logger.js";
import { noopLogger } from "./logger.js";

function buildClient(
  http: { fetch(url: string, init?: RequestInit): Promise<Response> },
  settings: AgentmemoryFullSettings,
  logger: PluginLogger = noopLogger,
): AgentmemoryClient {
  return new AgentmemoryClient(
    http,
    settings.baseUrl,
    settings.memoryNamespace,
    settings.bearerToken,
    logger,
  );
}

const plugin = definePlugin({
  async setup(ctx) {
    const logger: PluginLogger = ctx.logger ?? noopLogger;
    logger.info("agentmemory plugin setup started");

    function activityFor(companyId: string): ActivityLogger {
      return {
        log: (entry) => ctx.activity.log({ companyId, ...entry }),
      };
    }

    async function buildClientWithSecrets(
      settings: AgentmemoryFullSettings,
    ): Promise<AgentmemoryClient> {
      const token = await resolveToken(
        settings.bearerToken,
        ctx.secrets?.resolve?.bind(ctx.secrets),
      );
      return new AgentmemoryClient(
        ctx.http,
        settings.baseUrl,
        settings.memoryNamespace,
        token,
        logger,
      );
    }

    const recallCache: RecallCache = {
      async get(runId: string) {
        try {
          const cached = await ctx.state.get({
            scopeKind: "run",
            scopeId: runId,
            stateKey: "memory.autoRecall",
          });
          return cached as RecallOutput | null;
        } catch {
          return null;
        }
      },
    };

    const observeTracker: ObserveStateTracker = {
      async incrementObserveCount(runId: string) {
        const key = { scopeKind: "run" as const, scopeId: runId, stateKey: "memory.observeCount" };
        const current = (await ctx.state.get(key).catch(() => 0)) as number;
        await ctx.state.set(key, (current || 0) + 1);
      },
    };

    // --- Reconcile skill and curator for all existing companies ---
    const companies = await ctx.companies.list();
    for (const company of companies) {
      await reconcileSkill(ctx, company.id);
      await reconcileCurator(ctx, company.id);
    }

    // --- Reconcile on new company ---
    ctx.events.on("company.created", async (event) => {
      await reconcileSkill(ctx, event.companyId);
      await reconcileCurator(ctx, event.companyId);
    });

    // --- Data handler: health ---
    ctx.data.register("health", async ({ companyId }) => {
      const id = companyId ? String(companyId) : "";
      if (!id) {
        return {
          status: "error" as const,
          message: "No active company",
          checkedAt: new Date().toISOString(),
          baseUrl: "",
          memoryNamespace: "",
        };
      }
      return probeAgentmemory(ctx, id);
    });

    // --- Data handler: memory stats ---
    ctx.data.register("memory-stats", async ({ companyId }) => {
      const id = companyId ? String(companyId) : "";
      if (!id) return { memoriesCount: 0, graphNodes: 0, graphEdges: 0 };
      try {
        const settings = await readCompanySettings(ctx, id);
        const client = await buildClientWithSecrets(settings);
        const [memoriesCount, graphStats] = await Promise.all([
          client.memoriesCount().catch(() => 0),
          client.graphStats().catch(() => ({ nodes: 0, edges: 0 })),
        ]);
        return { memoriesCount, graphNodes: graphStats.nodes, graphEdges: graphStats.edges };
      } catch {
        return { memoriesCount: 0, graphNodes: 0, graphEdges: 0 };
      }
    });

    // --- Actions ---
    ctx.actions.register("get-company-settings", async (params) => {
      const companyId = requireCompanyId(params);
      return readCompanySettings(ctx, companyId);
    });

    ctx.actions.register("save-company-settings", async (params) => {
      const companyId = requireCompanyId(params);
      const input = (params.settings ?? params) as Partial<AgentmemoryFullSettings>;
      const saved = await writeCompanySettings(ctx, companyId, input);
      const health = await probeAgentmemory(ctx, companyId, saved);
      return { settings: saved, health };
    });

    ctx.actions.register("probe-health", async (params) => {
      const companyId = requireCompanyId(params);
      return probeAgentmemory(ctx, companyId);
    });

    ctx.actions.register("run-curator", async (params) => {
      const companyId = requireCompanyId(params);
      const settings = await readCompanySettings(ctx, companyId);
      const client = await buildClientWithSecrets(settings);
      return runCuratorJob(client, settings, logger);
    });

    // --- Tool handlers ---
    ctx.tools.register(
      TOOL_KEYS.recall,
      {
        displayName: "Memory Recall",
        description: "Recall relevant context from persistent memory before starting a task.",
        parametersSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "Description of what you're about to do" },
            project: { type: "string", description: "Project name for scoped search" },
            maxTokens: { type: "number", description: "Max tokens for context (defaults to budget)" },
          },
        },
      },
      async (params, runCtx) => {
        const p = params as Record<string, unknown>;
        const settings = await readCompanySettings(ctx, runCtx.companyId);
        const client = await buildClientWithSecrets(settings);
        const budget = calculateBudget(settings.contextWindowSize, settings.memoryBudgetPercent);
        const activity = activityFor(runCtx.companyId);
        const scope = { projectId: (runCtx as any).projectId, runId: (runCtx as any).runId };
        const result = await handleRecall(client, {
          query: String(p.query ?? ""),
          project: p.project ? String(p.project) : undefined,
          maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : budget,
        }, activity, scope, recallCache);
        return { data: result };
      },
    );

    ctx.tools.register(
      TOOL_KEYS.observe,
      {
        displayName: "Memory Observe",
        description: "Store an observation — decision, discovery, pattern, or failure — into persistent memory.",
        parametersSchema: {
          type: "object",
          required: ["observation", "category"],
          properties: {
            observation: { type: "string", description: "The insight to remember (1-3 sentences)" },
            category: {
              type: "string",
              enum: ["decision", "discovery", "pattern", "failure"],
              description: "Type of observation",
            },
            project: { type: "string", description: "Project name" },
          },
        },
      },
      async (params, runCtx) => {
        const p = params as Record<string, unknown>;
        const settings = await readCompanySettings(ctx, runCtx.companyId);
        const client = await buildClientWithSecrets(settings);
        const activity = activityFor(runCtx.companyId);
        const scope = { projectId: (runCtx as any).projectId, runId: (runCtx as any).runId };
        const result = await handleObserve(client, {
          observation: String(p.observation ?? ""),
          category: p.category as "decision" | "discovery" | "pattern" | "failure",
          project: p.project ? String(p.project) : undefined,
        }, activity, scope, observeTracker);
        return { data: result };
      },
    );

    ctx.tools.register(
      TOOL_KEYS.search,
      {
        displayName: "Memory Search",
        description: "Search persistent memory for specific information — use when checking if something was tried before.",
        parametersSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "What to search for" },
            project: { type: "string", description: "Project name for scoped search" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
        },
      },
      async (params, runCtx) => {
        const p = params as Record<string, unknown>;
        const settings = await readCompanySettings(ctx, runCtx.companyId);
        const client = await buildClientWithSecrets(settings);
        const activity = activityFor(runCtx.companyId);
        const scope = { projectId: (runCtx as any).projectId };
        const result = await handleSearch(client, {
          query: String(p.query ?? ""),
          project: p.project ? String(p.project) : undefined,
          limit: typeof p.limit === "number" ? p.limit : settings.defaultSearchLimit,
        }, activity, scope);
        return { data: result };
      },
    );

    ctx.tools.register(
      TOOL_KEYS.forget,
      {
        displayName: "Memory Forget",
        description: "Remove a specific memory that is outdated or incorrect.",
        parametersSchema: {
          type: "object",
          required: ["memoryId"],
          properties: {
            memoryId: { type: "string", description: "ID of the memory to remove (from recall/search results)" },
            reason: { type: "string", description: "Why this memory is being removed" },
          },
        },
      },
      async (params, runCtx) => {
        const p = params as Record<string, unknown>;
        const settings = await readCompanySettings(ctx, runCtx.companyId);
        const client = await buildClientWithSecrets(settings);
        const activity = activityFor(runCtx.companyId);
        const result = await handleForget(client, {
          memoryId: String(p.memoryId ?? ""),
          reason: p.reason ? String(p.reason) : undefined,
        }, activity);
        return { data: result };
      },
    );

    // --- Curator scheduled job ---
    ctx.jobs.register(JOB_KEYS.curatorCycle, async (job) => {
      logger.info("curator job started", { trigger: job.trigger, runId: job.runId });
      const companies = await ctx.companies.list();
      for (const company of companies) {
        try {
          const settings = await readCompanySettings(ctx, company.id);
          const client = await buildClientWithSecrets(settings);
          const activity = activityFor(company.id);
          const result = await runCuratorJob(client, settings, logger);
          await activity.log({
            message: `Curator: consolidated ${result.consolidated}, compressed ${result.compressed}, forgotten ${result.forgotten}, discarded ${result.discarded}`,
            metadata: result,
          });
        } catch (err) {
          logger.error("curator job failed for company", { companyId: company.id, err });
        }
      }
      logger.info("curator job completed");
    });

    // --- Auto-consolidate on issue completion ---
    ctx.events.on("issue.updated", async (event) => {
      const companyId = event.companyId;
      if (!companyId) return;
      const payload = event.payload as Record<string, unknown> | undefined;
      const status = payload?.status as string | undefined;
      if (status !== "done" && status !== "completed") return;
      const settings = await readCompanySettings(ctx, companyId);
      if (!settings.enableAutoConsolidate) return;
      const client = await buildClientWithSecrets(settings);
      const activity = activityFor(companyId);
      const result = await runCuratorJob(client, settings, logger).catch((err) => {
        logger.warn("curator failed on issue.updated", { companyId, err });
        return null;
      });
      if (result) {
        await activity.log({
          message: `Curator (issue completed): consolidated ${result.consolidated}, compressed ${result.compressed}`,
          metadata: result,
        });
      }
    });

    // --- Auto-recall on agent run start ---
    ctx.events.on("agent.run.started", async (event) => {
      const companyId = event.companyId;
      if (!companyId) return;

      const settings = await readCompanySettings(ctx, companyId);
      if (!settings.enableAutoRecall) return;

      const payload = event.payload as Record<string, unknown> | undefined;
      const runId = (payload?.runId as string | undefined) ?? event.entityId;
      const projectId = payload?.projectId as string | undefined;
      const issueId = payload?.issueId as string | undefined;

      if (!runId) return;

      try {
        let query = "general context";
        if (issueId) {
          try {
            const issue = await ctx.issues.get(issueId, companyId);
            if (issue) {
              query = [issue.title, (issue as any).description].filter(Boolean).join(" — ");
            }
          } catch {
            logger.warn("could not fetch issue for auto-recall", { issueId, companyId });
          }
        }

        const client = await buildClientWithSecrets(settings);
        const budget = calculateBudget(settings.contextWindowSize, settings.memoryBudgetPercent);
        const result = await handleRecall(client, {
          query,
          maxTokens: budget,
        }, activityFor(companyId), { projectId });

        await ctx.state.set({
          scopeKind: "run",
          scopeId: runId,
          stateKey: "memory.autoRecall",
        }, result);

        logger.info("auto-recall completed", { runId, resultCount: result.sources.length, tokenCount: result.tokenCount });
      } catch (err) {
        logger.warn("auto-recall failed", { runId, err });
      }
    });

    // --- Auto-observe on agent run finish ---
    ctx.events.on("agent.run.finished", async (event) => {
      const companyId = event.companyId;
      if (!companyId) return;

      const settings = await readCompanySettings(ctx, companyId);
      if (!settings.enableAutoObserve) return;

      const payload = event.payload as Record<string, unknown> | undefined;
      const runId = (payload?.runId as string | undefined) ?? event.entityId;
      const projectId = payload?.projectId as string | undefined;
      const issueId = payload?.issueId as string | undefined;

      if (!runId) return;

      try {
        // Check manual observe count — skip if agent already actively observed
        const observeCount = await ctx.state.get({
          scopeKind: "run",
          scopeId: runId,
          stateKey: "memory.observeCount",
        }).catch(() => 0) as number;

        if ((observeCount || 0) >= 2) {
          logger.info("skipping auto-observe, agent already observed during run", { runId, observeCount });
          return;
        }

        // Build summary from payload or issue
        let summary = payload?.summary as string | undefined;
        if (!summary && issueId) {
          try {
            const issue = await ctx.issues.get(issueId, companyId);
            if (issue) {
              summary = `Completed work on: ${issue.title}`;
            }
          } catch {
            logger.warn("could not fetch issue for auto-observe", { issueId });
          }
        }

        if (!summary) {
          summary = `Agent run ${runId} completed`;
        }

        const client = await buildClientWithSecrets(settings);
        await handleObserve(client, {
          observation: summary,
          category: "discovery",
        }, activityFor(companyId), { projectId, runId });

        logger.info("auto-observe completed", { runId });
      } catch (err) {
        logger.warn("auto-observe failed", { runId, err });
      }
    });

    logger.info("agentmemory plugin setup complete");
  },

  async onHealth() {
    return workerHealthDiagnostics();
  },

  async onValidateConfig() {
    return { ok: true, warnings: [] };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
