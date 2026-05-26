import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { probeAgentmemory, workerHealthDiagnostics } from "./health.js";
import {
  readCompanySettings,
  requireCompanyId,
  writeCompanySettings,
  type AgentmemoryFullSettings,
} from "./settings.js";
import { calculateBudget } from "./budget.js";
import { AgentmemoryClient } from "./agentmemory-client.js";
import { handleRecall } from "./tools/recall.js";
import { handleObserve } from "./tools/observe.js";
import { handleSearch } from "./tools/search.js";
import { reconcileSkillAllCompanies, reconcileSkill } from "./skill.js";
import {
  reconcileCuratorAllCompanies,
  reconcileCurator,
  runCuratorJob,
} from "./curator.js";
import { TOOL_KEYS } from "./constants.js";

function buildClient(
  http: { fetch(url: string, init?: RequestInit): Promise<Response> },
  settings: AgentmemoryFullSettings,
): AgentmemoryClient {
  return new AgentmemoryClient(
    http,
    settings.baseUrl,
    settings.memoryNamespace,
    settings.bearerToken,
  );
}

const plugin = definePlugin({
  async setup(ctx) {
    // --- Reconcile skill and curator agent for all companies (deferred, non-blocking) ---
    Promise.all([
      reconcileSkillAllCompanies(ctx),
      reconcileCuratorAllCompanies(ctx),
    ]).catch((err) => {
      ctx.logger.warn("Deferred reconciliation failed, will retry on next company event", { error: String(err) });
    });

    // --- Reconcile on new company ---
    ctx.events.on("company.created", async (event) => {
      await Promise.all([
        reconcileSkill(ctx, event.companyId),
        reconcileCurator(ctx, event.companyId),
      ]);
    });

    // --- Existing data handler: health ---
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

    // --- Stats data handler ---
    ctx.data.register("memory-stats", async ({ companyId }) => {
      const id = companyId ? String(companyId) : "";
      if (!id) return { memoriesCount: 0, graphNodes: 0, graphEdges: 0 };
      try {
        const settings = await readCompanySettings(ctx, id);
        const client = buildClient(ctx.http, settings);
        const [memoriesCount, graphStats] = await Promise.all([
          client.memoriesCount().catch(() => 0),
          client.graphStats().catch(() => ({ nodes: 0, edges: 0 })),
        ]);
        return { memoriesCount, graphNodes: graphStats.nodes, graphEdges: graphStats.edges };
      } catch {
        return { memoriesCount: 0, graphNodes: 0, graphEdges: 0 };
      }
    });

    // --- Existing actions ---
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
        const client = buildClient(ctx.http, settings);
        const budget = calculateBudget(settings.contextWindowSize, settings.memoryBudgetPercent);
        const result = await handleRecall(client, {
          query: String(p.query ?? ""),
          project: p.project ? String(p.project) : undefined,
          maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : budget,
        });
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
        const client = buildClient(ctx.http, settings);
        const result = await handleObserve(client, {
          observation: String(p.observation ?? ""),
          category: p.category as "decision" | "discovery" | "pattern" | "failure",
          project: p.project ? String(p.project) : undefined,
        });
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
        const client = buildClient(ctx.http, settings);
        const result = await handleSearch(client, {
          query: String(p.query ?? ""),
          project: p.project ? String(p.project) : undefined,
          limit: typeof p.limit === "number" ? p.limit : settings.defaultSearchLimit,
        });
        return { data: result };
      },
    );

    // --- Curator action (can be triggered manually or via scheduled job) ---
    ctx.actions.register("run-curator", async (params) => {
      const companyId = requireCompanyId(params);
      const settings = await readCompanySettings(ctx, companyId);
      const client = buildClient(ctx.http, settings);
      return runCuratorJob(client, settings);
    });

    // --- Auto-consolidate on issue status change to done/completed ---
    ctx.events.on("issue.updated", async (event) => {
      const companyId = event.companyId;
      if (!companyId) return;
      const payload = event.payload as Record<string, unknown> | undefined;
      const status = payload?.status as string | undefined;
      if (status !== "done" && status !== "completed") return;
      const settings = await readCompanySettings(ctx, companyId);
      if (!settings.enableAutoConsolidate) return;
      const client = buildClient(ctx.http, settings);
      await runCuratorJob(client, settings).catch(() => {});
    });
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
