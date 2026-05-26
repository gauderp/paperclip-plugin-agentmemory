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
  version: "0.4.0",
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
    "companies.read",
    "agent.tools.register",
    "agents.managed",
    "skills.managed",
    "jobs.schedule",
    "events.subscribe",
    "ui.dashboardWidget.register",
    "ui.action.register",
  ],
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
