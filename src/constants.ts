export const PLUGIN_ID = "customizar.agentmemory";

export const DEFAULT_BASE_URL = "http://127.0.0.1:3111";

export const HEALTH_PATH = "/agentmemory/health";

export const SETTINGS_STATE_KEY = "agentmemory.companySettings";

export const EXPORT_NAMES = {
  dashboardWidget: "DashboardWidget",
  settingsPage: "SettingsPage",
} as const;

export const SLOT_IDS = {
  healthWidget: "health-widget",
  settings: "settings",
} as const;
