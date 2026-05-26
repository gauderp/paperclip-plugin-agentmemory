import { useHostContext, usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

type MemoryStats = {
  memoriesCount: number;
  graphNodes: number;
  graphEdges: number;
};

export function StatsWidget(_props: PluginWidgetProps) {
  const { companyId } = useHostContext();
  const { data, loading, error, refresh } = usePluginData<MemoryStats>("memory-stats");

  if (!companyId) {
    return <div>Select a company to view memory stats.</div>;
  }
  if (loading) return <div>Loading memory stats…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>Agent Memory Stats</strong>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{data?.memoriesCount ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Memories</div>
        </div>
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{data?.graphNodes ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Graph Nodes</div>
        </div>
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{data?.graphEdges ?? 0}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Graph Edges</div>
        </div>
      </div>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}
