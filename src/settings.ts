import type { PluginContext, PluginStateScopeKind } from "@paperclipai/plugin-sdk";
import { DEFAULT_BASE_URL, SETTINGS_STATE_KEY } from "./constants.js";

export type AgentmemoryCompanySettings = {
  baseUrl: string;
  memoryNamespace: string;
  bearerToken?: string;
};

export type AgentmemoryHealthSnapshot = {
  status: "ok" | "degraded" | "error";
  message: string;
  checkedAt: string;
  baseUrl: string;
  memoryNamespace: string;
  httpStatus?: number;
  agentmemoryStatus?: string;
};

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_BASE_URL;
  }
  return value.trim().replace(/\/+$/, "");
}

export function normalizeCompanySettings(
  companyId: string,
  input: Partial<AgentmemoryCompanySettings> | null | undefined,
): AgentmemoryCompanySettings {
  const baseUrl = normalizeBaseUrl(input?.baseUrl);
  const memoryNamespace =
    typeof input?.memoryNamespace === "string" && input.memoryNamespace.trim().length > 0
      ? input.memoryNamespace.trim()
      : companyId;
  const bearerToken =
    typeof input?.bearerToken === "string" && input.bearerToken.trim().length > 0
      ? input.bearerToken.trim()
      : undefined;

  return { baseUrl, memoryNamespace, bearerToken };
}

export function companyStateRef(companyId: string) {
  return {
    scopeKind: "company" as PluginStateScopeKind,
    scopeId: companyId,
    stateKey: SETTINGS_STATE_KEY,
  };
}

export async function readCompanySettings(
  ctx: PluginContext,
  companyId: string,
): Promise<AgentmemoryCompanySettings> {
  const stored = await ctx.state.get(companyStateRef(companyId));
  return normalizeCompanySettings(companyId, stored as Partial<AgentmemoryCompanySettings> | null);
}

export async function writeCompanySettings(
  ctx: PluginContext,
  companyId: string,
  input: Partial<AgentmemoryCompanySettings>,
): Promise<AgentmemoryCompanySettings> {
  const next = normalizeCompanySettings(companyId, input);
  await ctx.state.set(companyStateRef(companyId), next);
  return next;
}

export function requireCompanyId(params: Record<string, unknown>): string {
  const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
  if (!companyId) {
    throw new Error("companyId is required");
  }
  return companyId;
}
