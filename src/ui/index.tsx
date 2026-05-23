import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { useEffect, useState } from "react";
import { DEFAULT_BASE_URL } from "../constants.js";
import type { AgentmemoryCompanySettings, AgentmemoryHealthSnapshot } from "../settings.js";

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

  useEffect(() => {
    if (!companyId) return;
    setMemoryNamespace(companyId);
    setBusy(true);
    setError(null);
    void loadSettings({ companyId })
      .then((raw) => {
        const settings = raw as AgentmemoryCompanySettings;
        setBaseUrl(settings.baseUrl ?? DEFAULT_BASE_URL);
        setMemoryNamespace(settings.memoryNamespace ?? companyId);
        setBearerToken(settings.bearerToken ?? "");
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
        },
      })) as { settings: AgentmemoryCompanySettings; health: AgentmemoryHealthSnapshot };
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
