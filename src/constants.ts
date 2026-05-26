export const PLUGIN_ID = "customizar.agentmemory";

export const DEFAULT_BASE_URL = "http://127.0.0.1:3111";

// Agentmemory API paths
export const HEALTH_PATH = "/agentmemory/health";
export const SMART_SEARCH_PATH = "/agentmemory/smart-search";
export const OBSERVE_PATH = "/agentmemory/observe";
export const SKETCHES_PATH = "/agentmemory/sketches";
export const CONSOLIDATE_PATH = "/agentmemory/consolidate";
export const CRYSTALS_AUTO_PATH = "/agentmemory/crystals/auto";
export const FLOW_COMPRESS_PATH = "/agentmemory/flow/compress";
export const AUTO_FORGET_PATH = "/agentmemory/auto-forget";
export const SKETCHES_GC_PATH = "/agentmemory/sketches/gc";
export const GRAPH_EXTRACT_PATH = "/agentmemory/graph/extract";
export const GRAPH_STATS_PATH = "/agentmemory/graph/stats";
export const MEMORIES_PATH = "/agentmemory/memories";

// Plugin state keys
export const SETTINGS_STATE_KEY = "agentmemory.companySettings";

// Tool keys
export const TOOL_KEYS = {
  recall: "memory-recall",
  observe: "memory-observe",
  search: "memory-search",
} as const;

// Skill & agent keys
export const SKILL_KEY = "agent-memory";
export const CURATOR_AGENT_KEY = "memory-curator";

// UI exports
export const EXPORT_NAMES = {
  dashboardWidget: "DashboardWidget",
  settingsPage: "SettingsPage",
  statsWidget: "StatsWidget",
} as const;

export const SLOT_IDS = {
  healthWidget: "health-widget",
  settings: "settings",
  statsWidget: "stats-widget",
} as const;

// Budget defaults
export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MEMORY_BUDGET_PERCENT = 40;
export const DEFAULT_SEARCH_LIMIT = 20;
export const TOOL_OVERHEAD_TOKENS = 3_000;
export const CHARS_PER_TOKEN = 4;
