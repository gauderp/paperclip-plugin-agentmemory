import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  PLUGIN_ID,
  SLOT_IDS,
  TOOL_KEYS,
  SKILL_KEY,
  CURATOR_AGENT_KEY,
} from "./constants.js";
import { SKILL_DISPLAY_NAME, SKILL_DESCRIPTION, SKILL_MARKDOWN } from "./skill.js";
import {
  CURATOR_DISPLAY_NAME,
  CURATOR_ROLE,
  CURATOR_TITLE,
  CURATOR_CAPABILITIES,
  CURATOR_INSTRUCTIONS,
} from "./curator.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.2.0",
  displayName: "Agent Memory",
  description:
    "Memory-as-Skill system for Paperclip agents. Persistent recall, observation, and search with token budget enforcement.",
  author: "paperclip-plugin-agentmemory contributors",
  categories: ["connector"],
  capabilities: [
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register",
    "agent.tools.register",
    "agents.managed",
    "skills.managed",
    "jobs.schedule",
    "events.subscribe",
    "ui.dashboardWidget.register",
    "ui.action.register",
  ],
  instanceConfigSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: {
      baseUrl: {
        type: "string",
        title: "AgentMemory URL",
        description: "URL do serviço agentmemory",
        default: "http://127.0.0.1:3111",
      },
      memoryNamespace: {
        type: "string",
        title: "Memory Namespace",
        description: "Namespace para isolamento (default: company ID)",
      },
      bearerToken: {
        type: "string",
        title: "Bearer Token",
        description: "Token de autenticação (opcional para localhost)",
      },
      contextWindowSize: {
        type: "number",
        title: "Janela de Contexto (tokens)",
        description: "Tamanho da janela do modelo usado pelos agentes",
        default: 128000,
      },
      memoryBudgetPercent: {
        type: "number",
        title: "Budget de Memória (%)",
        description: "Percentual máximo da janela para injeção de memória",
        default: 40,
      },
      defaultSearchLimit: {
        type: "number",
        title: "Limite de Resultados",
        description: "Máximo de resultados por busca",
        default: 20,
      },
      curatorIntervalHours: {
        type: "number",
        title: "Intervalo do Curador (horas)",
        description: "Frequência da rotina de consolidação",
        default: 6,
      },
      autoForgetDays: {
        type: "number",
        title: "Auto-Forget (dias)",
        description: "Observações consolidadas são removidas após N dias",
        default: 30,
      },
      sketchTTLDays: {
        type: "number",
        title: "TTL de Sketches (dias)",
        description: "Sketches não-promovidos são descartados após N dias",
        default: 14,
      },
      enableKnowledgeGraph: {
        type: "boolean",
        title: "Knowledge Graph",
        description: "Extrair entidades/relações automaticamente",
        default: false,
      },
      enableAutoConsolidate: {
        type: "boolean",
        title: "Auto-Consolidação",
        description: "Consolidar observações automaticamente após issue completada",
        default: true,
      },
    },
  },
  tools: [
    {
      name: TOOL_KEYS.recall,
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
    {
      name: TOOL_KEYS.observe,
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
    {
      name: TOOL_KEYS.search,
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
  ],
  skills: [
    {
      skillKey: SKILL_KEY,
      displayName: SKILL_DISPLAY_NAME,
      description: SKILL_DESCRIPTION,
      markdown: SKILL_MARKDOWN,
    },
  ],
  agents: [
    {
      agentKey: CURATOR_AGENT_KEY,
      displayName: CURATOR_DISPLAY_NAME,
      role: CURATOR_ROLE,
      title: CURATOR_TITLE,
      capabilities: CURATOR_CAPABILITIES,
      instructions: {
        content: CURATOR_INSTRUCTIONS,
      },
    },
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: SLOT_IDS.healthWidget,
        displayName: "Agent Memory Health",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.statsWidget,
        displayName: "Agent Memory Stats",
        exportName: EXPORT_NAMES.statsWidget,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settings,
        displayName: "Agent Memory",
        exportName: EXPORT_NAMES.settingsPage,
      },
    ],
  },
};

export default manifest;
