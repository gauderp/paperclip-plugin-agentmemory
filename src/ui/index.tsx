import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { useEffect, useState } from "react";
import { DEFAULT_BASE_URL } from "../constants.js";
import type { AgentmemoryFullSettings, AgentmemoryHealthSnapshot } from "../settings.js";

export { StatsWidget } from "./StatsWidget.js";

export function DashboardWidget(_props: PluginWidgetProps) {
  const { companyId } = useHostContext();
  const { data, loading, error, refresh } = usePluginData<AgentmemoryHealthSnapshot>("health");

  if (!companyId) {
    return <div>Select a company to view agentmemory health.</div>;
  }
  if (loading) return <div>Checking agentmemory…</div>;
  if (error) return <div>Plugin error: {error.message}</div>;

  const status = data?.status ?? "error";
  const color =
    status === "ok" ? "#15803d" : status === "degraded" ? "#b45309" : "#b91c1c";

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>Agent Memory</strong>
      <div style={{ color }}>Status: {status}</div>
      <div style={{ fontSize: "0.875rem", color: "#64748b" }}>{data?.message ?? "No data"}</div>
      <div style={{ fontSize: "0.75rem" }}>
        {data?.baseUrl ?? DEFAULT_BASE_URL} · namespace {data?.memoryNamespace ?? companyId}
      </div>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}

export function SettingsPage(_props: PluginSettingsPageProps) {
  const { companyId } = useHostContext();
  const loadSettings = usePluginAction("get-company-settings");
  const saveSettings = usePluginAction("save-company-settings");
  const probeHealth = usePluginAction("probe-health");

  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [memoryNamespace, setMemoryNamespace] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [health, setHealth] = useState<AgentmemoryHealthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextWindowSize, setContextWindowSize] = useState(128000);
  const [memoryBudgetPercent, setMemoryBudgetPercent] = useState(40);
  const [defaultSearchLimit, setDefaultSearchLimit] = useState(20);
  const [curatorIntervalHours, setCuratorIntervalHours] = useState(6);
  const [autoForgetDays, setAutoForgetDays] = useState(30);
  const [sketchTTLDays, setSketchTTLDays] = useState(14);
  const [enableKnowledgeGraph, setEnableKnowledgeGraph] = useState(false);
  const [enableAutoConsolidate, setEnableAutoConsolidate] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setMemoryNamespace(companyId);
    setBusy(true);
    setError(null);
    void loadSettings({ companyId })
      .then((raw) => {
        const settings = raw as AgentmemoryFullSettings;
        setBaseUrl(settings.baseUrl ?? DEFAULT_BASE_URL);
        setMemoryNamespace(settings.memoryNamespace ?? companyId);
        setBearerToken(settings.bearerToken ?? "");
        setContextWindowSize(settings.contextWindowSize ?? 128000);
        setMemoryBudgetPercent(settings.memoryBudgetPercent ?? 40);
        setDefaultSearchLimit(settings.defaultSearchLimit ?? 20);
        setCuratorIntervalHours(settings.curatorIntervalHours ?? 6);
        setAutoForgetDays(settings.autoForgetDays ?? 30);
        setSketchTTLDays(settings.sketchTTLDays ?? 14);
        setEnableKnowledgeGraph(settings.enableKnowledgeGraph ?? false);
        setEnableAutoConsolidate(settings.enableAutoConsolidate ?? true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [companyId, loadSettings]);

  if (!companyId) {
    return <div>Select a company to configure agentmemory.</div>;
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const result = (await saveSettings({
        companyId,
        settings: {
          baseUrl,
          memoryNamespace: memoryNamespace || companyId,
          bearerToken: bearerToken || undefined,
          contextWindowSize,
          memoryBudgetPercent,
          defaultSearchLimit,
          curatorIntervalHours,
          autoForgetDays,
          sketchTTLDays,
          enableKnowledgeGraph,
          enableAutoConsolidate,
        },
      })) as { settings: AgentmemoryFullSettings; health: AgentmemoryHealthSnapshot };
      setHealth(result.health);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleProbe() {
    setBusy(true);
    setError(null);
    try {
      const snapshot = (await probeHealth({ companyId })) as AgentmemoryHealthSnapshot;
      setHealth(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 520 }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
        Settings are stored per company. Use the memory namespace to isolate observations (defaults to
        company id).
      </p>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>agentmemory base URL</span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={DEFAULT_BASE_URL}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Memory namespace</span>
        <input
          value={memoryNamespace}
          onChange={(e) => setMemoryNamespace(e.target.value)}
          placeholder={companyId}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Bearer token (optional)</span>
        <input
          type="password"
          value={bearerToken}
          onChange={(e) => setBearerToken(e.target.value)}
          placeholder="AGENTMEMORY_SECRET when enabled"
          style={{ padding: "0.5rem" }}
        />
      </label>

      <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0.5rem 0" }} />
      <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem", fontWeight: 600 }}>
        Memory Configuration
      </p>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Context window (tokens)</span>
        <input
          type="number"
          value={contextWindowSize}
          onChange={(e) => setContextWindowSize(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Memory budget (%)</span>
        <input
          type="number"
          min={1}
          max={100}
          value={memoryBudgetPercent}
          onChange={(e) => setMemoryBudgetPercent(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Default search limit</span>
        <input
          type="number"
          value={defaultSearchLimit}
          onChange={(e) => setDefaultSearchLimit(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Curator interval (hours)</span>
        <input
          type="number"
          value={curatorIntervalHours}
          onChange={(e) => setCuratorIntervalHours(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Auto-forget (days)</span>
        <input
          type="number"
          value={autoForgetDays}
          onChange={(e) => setAutoForgetDays(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span>Sketch TTL (days)</span>
        <input
          type="number"
          value={sketchTTLDays}
          onChange={(e) => setSketchTTLDays(Number(e.target.value))}
          style={{ padding: "0.5rem" }}
        />
      </label>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enableKnowledgeGraph}
          onChange={(e) => setEnableKnowledgeGraph(e.target.checked)}
        />
        <span>Enable Knowledge Graph extraction</span>
      </label>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enableAutoConsolidate}
          onChange={(e) => setEnableAutoConsolidate(e.target.checked)}
        />
        <span>Auto-consolidate after issue completed</span>
      </label>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" disabled={busy} onClick={() => void handleSave()}>
          Save
        </button>
        <button type="button" disabled={busy} onClick={() => void handleProbe()}>
          Test connection
        </button>
      </div>

      {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}

      {health ? (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "0.75rem",
            fontSize: "0.875rem",
          }}
        >
          <div>
            <strong>Health:</strong> {health.status}
          </div>
          <div>{health.message}</div>
          <div style={{ color: "#64748b" }}>Checked {health.checkedAt}</div>
        </div>
      ) : null}
    </div>
  );
}
