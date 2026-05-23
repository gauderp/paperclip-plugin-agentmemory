#!/usr/bin/env node
/**
 * Windows-safe agentmemory demo (127.0.0.1 base URL).
 * Upstream CLI uses http://localhost:PORT which fails on Windows (::1 vs 127.0.0.1).
 */
const base = (process.env.AGENTMEMORY_URL || "http://127.0.0.1:3111").replace(/\/+$/, "");
const demoProject = "/tmp/agentmemory-demo-windows";

async function probe() {
  const res = await fetch(`${base}/agentmemory/livez`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`livez HTTP ${res.status}`);
}

async function postJson(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

async function main() {
  await probe();
  const sessionId = `demo-${Date.now()}`;
  const cwd = process.cwd() || "C:\\Users\\Desktop";
  await postJson("/agentmemory/session/start", { sessionId, project: demoProject, cwd });
  await postJson("/agentmemory/observe", {
    hookType: "post_tool_use",
    sessionId,
    project: demoProject,
    cwd,
    timestamp: new Date().toISOString(),
    data: {
      tool_name: "edit",
      tool_input: { file: "auth.ts" },
      tool_output: "Implemented JWT auth middleware with refresh tokens and rate limiting.",
    },
  });
  await new Promise((r) => setTimeout(r, 10000));
  await postJson("/agentmemory/session/end", { sessionId });
  const search = await postJson("/agentmemory/smart-search", {
    query: "jwt auth middleware rate limiting",
    project: demoProject,
    limit: 5,
  });
  const hits = search.results?.length ?? 0;
  if (hits < 1) throw new Error("smart-search returned 0 hits");
  console.log(`demo OK: base=${base} hits=${hits}`);
}

main().catch((err) => {
  console.error(`demo FAILED: ${err.message}`);
  process.exit(1);
});
