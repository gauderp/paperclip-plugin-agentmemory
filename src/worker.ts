import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { probeAgentmemory, workerHealthDiagnostics } from "./health.js";
import {
  readCompanySettings,
  requireCompanyId,
  writeCompanySettings,
  type AgentmemoryCompanySettings,
} from "./settings.js";

const plugin = definePlugin({
  async setup(ctx) {
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

    ctx.actions.register("get-company-settings", async (params) => {
      const companyId = requireCompanyId(params);
      return readCompanySettings(ctx, companyId);
    });

    ctx.actions.register("save-company-settings", async (params) => {
      const companyId = requireCompanyId(params);
      const input = (params.settings ?? params) as Partial<AgentmemoryCompanySettings>;
      const saved = await writeCompanySettings(ctx, companyId, input);
      const health = await probeAgentmemory(ctx, companyId, saved);
      return { settings: saved, health };
    });

    ctx.actions.register("probe-health", async (params) => {
      const companyId = requireCompanyId(params);
      return probeAgentmemory(ctx, companyId);
    });
  },

  async onHealth() {
    // Process liveness only; per-company reachability is exposed via data/actions.
    return workerHealthDiagnostics();
  },

  async onValidateConfig() {
    return { ok: true, warnings: ["Connector uses company-scoped settings (base URL, namespace)."] };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
