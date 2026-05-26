import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { EXPORT_NAMES, PLUGIN_ID, SLOT_IDS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.3.3",
  displayName: "Agent Memory",
  description:
    "Connector for local agentmemory. Company-scoped settings and health probe.",
  author: "paperclip-plugin-agentmemory contributors",
  categories: ["connector"],
  capabilities: [
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register",
    "ui.dashboardWidget.register",
    "ui.action.register",
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
        type: "settingsPage",
        id: SLOT_IDS.settings,
        displayName: "Agent Memory",
        exportName: EXPORT_NAMES.settingsPage,
      },
    ],
  },
};

export default manifest;
