import type { PluginContext, PluginHealthDiagnostics } from "@paperclipai/plugin-sdk";
import { HEALTH_PATH } from "./constants.js";
import {
  type AgentmemoryCompanySettings,
  type AgentmemoryHealthSnapshot,
  normalizeCompanySettings,
  readCompanySettings,
} from "./settings.js";

type AgentmemoryHealthBody = {
  status?: string;
  service?: string;
  version?: string;
};

export async function probeAgentmemory(
  ctx: PluginContext,
  companyId: string,
  override?: Partial<AgentmemoryCompanySettings>,
): Promise<AgentmemoryHealthSnapshot> {
  const settings = override
    ? normalizeCompanySettings(companyId, override)
    : await readCompanySettings(ctx, companyId);
  const checkedAt = new Date().toISOString();
  const url = `${settings.baseUrl}${HEALTH_PATH}`;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (settings.bearerToken) {
      headers.Authorization = `Bearer ${settings.bearerToken}`;
    }

    const response = await ctx.http.fetch(url, {
      method: "GET",
      headers,
    });

    const bodyText = await response.text();
    let body: AgentmemoryHealthBody | null = null;
    try {
      body = bodyText ? (JSON.parse(bodyText) as AgentmemoryHealthBody) : null;
    } catch (_parseErr) {
      body = null;
    }

    const agentmemoryStatus = typeof body?.status === "string" ? body.status : undefined;
    const okHttp = response.ok;
    const okService = !agentmemoryStatus || agentmemoryStatus === "healthy";

    if (okHttp && okService) {
      return {
        status: "ok",
        message: "agentmemory reachable",
        checkedAt,
        baseUrl: settings.baseUrl,
        memoryNamespace: settings.memoryNamespace,
        httpStatus: response.status,
        agentmemoryStatus,
      };
    }

    return {
      status: okHttp ? "degraded" : "error",
      message: agentmemoryStatus
        ? `agentmemory reported status=${agentmemoryStatus}`
        : `agentmemory health HTTP ${response.status}`,
      checkedAt,
      baseUrl: settings.baseUrl,
      memoryNamespace: settings.memoryNamespace,
      httpStatus: response.status,
      agentmemoryStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      message: `agentmemory unreachable: ${message}`,
      checkedAt,
      baseUrl: settings.baseUrl,
      memoryNamespace: settings.memoryNamespace,
    };
  }
}

export function workerHealthDiagnostics(): PluginHealthDiagnostics {
  // Worker-level health: process is up; connector reachability is company-scoped in UI data.
  return {
    status: "ok",
    message: "Agent Memory connector worker running",
    details: {
      healthPath: HEALTH_PATH,
    },
  };
}

export function toPluginHealth(snapshot: AgentmemoryHealthSnapshot): PluginHealthDiagnostics {
  return {
    status: snapshot.status,
    message: snapshot.message,
    details: {
      checkedAt: snapshot.checkedAt,
      baseUrl: snapshot.baseUrl,
      memoryNamespace: snapshot.memoryNamespace,
      httpStatus: snapshot.httpStatus,
      agentmemoryStatus: snapshot.agentmemoryStatus,
    },
  };
}
