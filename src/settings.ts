import type { PluginContext, PluginStateScopeKind } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_BASE_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MEMORY_BUDGET_PERCENT,
  DEFAULT_SEARCH_LIMIT,
  SETTINGS_STATE_KEY,
} from "./constants.js";

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

export type AgentmemoryMemoryConfig = {
  contextWindowSize: number;
  memoryBudgetPercent: number;
  defaultSearchLimit: number;
  curatorIntervalHours: number;
  autoForgetDays: number;
  sketchTTLDays: number;
  enableKnowledgeGraph: boolean;
  enableAutoConsolidate: boolean;
  enableAutoRecall: boolean;
  enableAutoObserve: boolean;
};

export type AgentmemoryFullSettings = AgentmemoryCompanySettings & AgentmemoryMemoryConfig;

export const MEMORY_CONFIG_DEFAULTS: AgentmemoryMemoryConfig = {
  contextWindowSize: 128_000,
  memoryBudgetPercent: 40,
  defaultSearchLimit: 20,
  curatorIntervalHours: 6,
  autoForgetDays: 30,
  sketchTTLDays: 14,
  enableKnowledgeGraph: false,
  enableAutoConsolidate: true,
  enableAutoRecall: true,
  enableAutoObserve: true,
};

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_BASE_URL;
  }
  return value.trim().replace(/\/+$/, "");
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

function clampPercent(value: unknown, fallback: number): number {
  if (typeof value !== "number") return fallback;
  return Math.max(1, Math.min(100, value));
}

export function normalizeCompanySettings(
  companyId: string,
  input: Partial<AgentmemoryFullSettings> | null | undefined,
): AgentmemoryFullSettings {
  const baseUrl = normalizeBaseUrl(input?.baseUrl);
  const memoryNamespace =
    typeof input?.memoryNamespace === "string" && input.memoryNamespace.trim().length > 0
      ? input.memoryNamespace.trim()
      : companyId;
  const bearerToken =
    typeof input?.bearerToken === "string" && input.bearerToken.trim().length > 0
      ? input.bearerToken.trim()
      : undefined;

  return {
    baseUrl,
    memoryNamespace,
    bearerToken,
    contextWindowSize: positiveNumber(input?.contextWindowSize, MEMORY_CONFIG_DEFAULTS.contextWindowSize),
    memoryBudgetPercent: clampPercent(input?.memoryBudgetPercent, MEMORY_CONFIG_DEFAULTS.memoryBudgetPercent),
    defaultSearchLimit: positiveNumber(input?.defaultSearchLimit, MEMORY_CONFIG_DEFAULTS.defaultSearchLimit),
    curatorIntervalHours: positiveNumber(input?.curatorIntervalHours, MEMORY_CONFIG_DEFAULTS.curatorIntervalHours),
    autoForgetDays: positiveNumber(input?.autoForgetDays, MEMORY_CONFIG_DEFAULTS.autoForgetDays),
    sketchTTLDays: positiveNumber(input?.sketchTTLDays, MEMORY_CONFIG_DEFAULTS.sketchTTLDays),
    enableKnowledgeGraph: typeof input?.enableKnowledgeGraph === "boolean" ? input.enableKnowledgeGraph : MEMORY_CONFIG_DEFAULTS.enableKnowledgeGraph,
    enableAutoConsolidate: typeof input?.enableAutoConsolidate === "boolean" ? input.enableAutoConsolidate : MEMORY_CONFIG_DEFAULTS.enableAutoConsolidate,
    enableAutoRecall: typeof input?.enableAutoRecall === "boolean" ? input.enableAutoRecall : MEMORY_CONFIG_DEFAULTS.enableAutoRecall,
    enableAutoObserve: typeof input?.enableAutoObserve === "boolean" ? input.enableAutoObserve : MEMORY_CONFIG_DEFAULTS.enableAutoObserve,
  };
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
): Promise<AgentmemoryFullSettings> {
  const stored = await ctx.state.get(companyStateRef(companyId));
  return normalizeCompanySettings(companyId, stored as Partial<AgentmemoryFullSettings> | null);
}

export async function writeCompanySettings(
  ctx: PluginContext,
  companyId: string,
  input: Partial<AgentmemoryFullSettings>,
): Promise<AgentmemoryFullSettings> {
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

export async function resolveToken(
  token: string | undefined,
  secretsResolver?: (ref: string) => Promise<string>,
): Promise<string | undefined> {
  if (!token || token.trim().length === 0) return undefined;
  if (token.startsWith("secret:") && secretsResolver) {
    const ref = token.slice("secret:".length);
    try {
      return await secretsResolver(ref);
    } catch {
      return token;
    }
  }
  return token;
}
