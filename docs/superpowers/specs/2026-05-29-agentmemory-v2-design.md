# Agent Memory Plugin v2 — Design Spec

**Plugin:** `@gaud_erp/paperclip-plugin-agentmemory`
**Current version:** 0.4.0
**Target versions:** 0.5.0 (Phases 1-2), 0.6.0 (Phases 3-4)
**Date:** 2026-05-29

## Problem Statement

The plugin provides persistent memory to Paperclip agents via 3 tools (recall, observe, search) backed by an external agentmemory service. While the architecture is sound, several SDK capabilities are unused, creating gaps:

1. **Curator never runs on schedule** — manifest declares `jobs.schedule` but never registers a job. Memory curation only happens on `issue.updated` or manual action.
2. **Zero observability** — no activity logging, no structured logs. Operations are invisible to users and other plugins.
3. **Bearer token in plain text** — stored in plugin state without secret resolution.
4. **Agents must remember to remember** — memory tools are opt-in via skill instructions. Agents frequently skip recall/observe calls.
5. **No memory correction** — agents cannot delete or correct wrong memories.
6. **No scoping** — project/issue context is a free-form string, leading to cross-project pollution.
7. **No cross-plugin integration** — the plugin emits no events; other plugins cannot react to memory operations.
8. **No meta-analysis** — memory is write-heavy with no retrospective/reflection capability.
9. **Dashboard polling** — widgets use `ctx.data` polling instead of real-time streams.

## Architecture Overview

```
Phase 1: Infrastructure    Phase 2: Tools & Scoped    Phase 3: Automation    Phase 4: Ecosystem
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐   ┌──────────────────┐
│ Curator Job       │      │ memory-forget     │      │ Auto-recall      │   │ Cross-plugin     │
│ Activity Logging  │ ──▶  │ Scoped memory     │ ──▶  │ Auto-observe     │──▶│ events           │
│ Secrets           │      │ Skill update      │      │ Hybrid skill     │   │ Reflection skill │
│ Structured logs   │      │                   │      │                  │   │ Real-time streams│
└──────────────────┘      └──────────────────┘      └──────────────────┘   └──────────────────┘
        v0.5.0                    v0.5.0                   v0.6.0                 v0.6.0
```

---

## Phase 1: Infrastructure (v0.5.0)

Solidify the foundation — fix what's broken, add observability.

### 1.1 Curator Scheduled Job

**Problem:** Manifest declares `jobs.schedule` but `ctx.jobs.register()` is never called. Curator only runs on `issue.updated` or manual `run-curator` action. If no issues are closed, memory is never curated.

**Solution:**
- Register `ctx.jobs.register("curator-cycle", handler)` in `setup()`
- Handler reads company settings, builds client, calls `runCuratorJob()`
- Interval comes from `curatorIntervalHours` setting (default 6h)
- Keep the `issue.updated` trigger as complement (immediate curation post-issue)
- Log curator results via `ctx.activity.log()` and `ctx.logger`

**Files changed:** `worker.ts`, `curator.ts`

**Acceptance criteria:**
- Curator runs automatically every N hours without requiring issue closure
- Curator results are logged in activity feed
- Manual `run-curator` action still works
- `issue.updated` trigger still works as before

### 1.2 Activity Logging

**Problem:** No memory operation appears in Paperclip's activity feed. Users have no visibility into what agents remember or observe.

**Solution:**
- Add `ctx.activity.log()` calls in each tool handler:
  - `memory-recall`: `"Recalled {n} memories ({tokenCount} tokens) for project {project}"`
  - `memory-observe`: `"Observed {category}: {observation_truncated}"`
  - `memory-search`: `"Searched memory for '{query}' — {n} results"`
- Add in curator job: `"Curator: consolidated {n}, compressed {n}, forgotten {n}, discarded {n}"`
- Pass `ctx` (or `ctx.activity`) to tool handler functions — currently they only receive `client`

**Files changed:** `tools/recall.ts`, `tools/observe.ts`, `tools/search.ts`, `curator.ts`, `worker.ts`

**Breaking change:** Tool handler function signatures change to accept an activity logger. Internal only — no public API change.

**Acceptance criteria:**
- Every recall, observe, search, and curator operation appears in the Paperclip activity feed
- Activity entries include company context and relevant metrics

### 1.3 Secrets for Bearer Token

**Problem:** Bearer token is stored in plain text in plugin state.

**Solution:**
- If `bearerToken` value starts with `secret:`, resolve via `ctx.secrets.resolve()`
- Otherwise, use the value directly (backward compatible)
- Update settings page UI to indicate that secret references are supported
- Resolve secrets at request time, not at settings-write time (secrets may rotate)

**Files changed:** `settings.ts`, `worker.ts`

**Acceptance criteria:**
- Existing plain-text tokens continue to work
- `secret:my-secret-name` resolves via SDK secrets API
- Resolution happens per-request, not cached

### 1.4 Structured Logging

**Problem:** No structured logging. Errors are silently swallowed (`.catch(() => {})` in several places).

**Solution:**
- Accept `ctx.logger` in plugin setup and pass to helpers
- Replace all `.catch(() => {})` with `.catch((err) => logger.warn("...", { err }))`
- Add `logger.info()` at key lifecycle points: setup complete, job registered, skill reconciled
- Add `logger.error()` for HTTP failures in `AgentmemoryClient`

**Files changed:** `worker.ts`, `curator.ts`, `agentmemory-client.ts`, `health.ts`

**Acceptance criteria:**
- No silent `.catch(() => {})` remains in the codebase
- All errors are logged with context (operation, companyId, error message)
- Plugin startup logs confirmation of registered jobs, tools, and skills

---

## Phase 2: Tools & Scoped Memory (v0.5.0)

New tools for agents and context-aware memory scoping.

### 2.1 New Tool: `memory-forget`

**Problem:** Agents cannot correct wrong memories. Outdated observations pollute recall results.

**Solution:**
- New tool `memory-forget` with parameters:
  - `memoryId` (required): ID of the memory to remove
  - `reason` (optional): Why it's being removed
- New `AgentmemoryClient.forget(memoryId: string)` method — POST to `/agentmemory/forget`
- Activity log on forget
- Update skill markdown with guidance on when to use forget

**Tool schema:**
```json
{
  "name": "memory-forget",
  "parametersSchema": {
    "type": "object",
    "required": ["memoryId"],
    "properties": {
      "memoryId": { "type": "string", "description": "ID of the memory to remove (from recall/search results)" },
      "reason": { "type": "string", "description": "Why this memory is being removed" }
    }
  }
}
```

**Files added:** `tools/forget.ts`
**Files changed:** `agentmemory-client.ts`, `constants.ts`, `manifest.ts`, `worker.ts`, `skill.ts`

**Acceptance criteria:**
- Agent can call `memory-forget` with an ID from recall/search results
- Memory is removed from future recall/search
- Activity log records the forget with reason
- Skill markdown teaches when to use it

### 2.2 Scoped Memory by Project/Issue

**Problem:** The `project` field is a free-form string passed manually by the agent. Agents forget or pass inconsistent values, causing cross-project memory pollution.

**Solution:**
- Extract `projectId` and `issueId` from `runCtx` in tool handlers (the SDK run context)
- If agent doesn't pass `project`, auto-fill from run context
- In `handleRecall`, search in 2 tiers:
  1. Project/issue-scoped memories (boosted score)
  2. Namespace-global memories (lower score)
- In `handleObserve`, auto-tag with project and issue from context
- In `handleSearch`, default to project scope but allow `project: "*"` for global search

**Files changed:** `tools/recall.ts`, `tools/observe.ts`, `tools/search.ts`, `worker.ts`, `agentmemory-client.ts`

**Acceptance criteria:**
- Tools auto-fill project/issue from run context when not explicitly passed
- Recall prioritizes same-project memories over global ones
- Observe auto-tags with project and issue
- Agent can still override with explicit project parameter
- Agent can search globally with `project: "*"`

### 2.3 Update Skill Markdown

**Problem:** Skill needs to reflect new tools and behaviors.

**Solution:**
- Add `memory-forget` section: "If recall returned outdated info, call memory-forget before observing the correction"
- Document auto-scoping: "Project and issue context are injected automatically. You don't need to pass the project parameter unless targeting a different project."
- Add guidance: search results now include `memoryId` for use with forget

**Files changed:** `skill.ts`

**Acceptance criteria:**
- Skill markdown documents all 4 tools (recall, observe, search, forget)
- Skill explains auto-scoping behavior
- Skill explains when to use forget vs. observe

---

## Phase 3: Automation (v0.6.0)

Make memory automatic — agents don't need to "remember to remember."

### 3.1 Auto-Recall on `agent.run.started`

**Problem:** Skill says "call memory-recall at the start of each task" but agents frequently skip it, especially smaller models.

**Solution:**
- Subscribe to `agent.run.started` event in worker
- Extract from event: `agentId`, `runId`, `companyId`, `issueId`, `projectId`
- Build recall query from issue context (title + description via `ctx.issues.get()`)
- Call `handleRecall` and store result in `ctx.state` with scope `run` (key: `memory.autoRecall`)
- In the `memory-recall` tool handler: check if auto-recall result exists in run state. If yes, return it directly (avoid duplicate search). If no, perform normal search.
- Activity log: `"Auto-recalled {n} memories for run {runId}"`
- New setting: `enableAutoRecall` (default `true`)

**Files changed:** `worker.ts`, `settings.ts`, `tools/recall.ts`

**Acceptance criteria:**
- Memory context is pre-loaded at run start without agent action
- If agent calls `memory-recall` explicitly, the pre-loaded result is returned (no duplicate API call)
- Auto-recall can be disabled via settings
- Activity log shows auto-recall events

### 3.2 Auto-Observe on `agent.run.finished`

**Problem:** Most agents don't call `memory-observe` consistently. Insights from runs are lost.

**Solution:**
- Subscribe to `agent.run.finished` event in worker
- Extract run summary from event payload (if available)
- If not in payload, extract from issue via `ctx.issues.get()`: status changes, comments added, documents created
- Generate automatic observation with category `"discovery"` and run summary
- Deduplication: check run state for count of manual `memory-observe` calls during the run. If agent already observed 2+ times, skip auto-observe (agent is actively using memory). If 0-1 manual observations, auto-observe.
- Track manual observe count: increment a counter in `ctx.state` (scope `run`) each time `memory-observe` tool is called
- Activity log: `"Auto-observed run summary for issue #{issueId}"`
- New setting: `enableAutoObserve` (default `true`)

**Files changed:** `worker.ts`, `settings.ts`, `tools/observe.ts`

**Acceptance criteria:**
- Run summaries are automatically stored in memory
- Agents that actively observe are not double-observed
- Auto-observe can be disabled via settings
- Activity log shows auto-observe events

### 3.3 Update Skill for Hybrid Mode

**Problem:** With auto-recall and auto-observe, the skill needs to tell agents what's already automatic.

**Solution:**
- Update skill markdown:
  - "Memory context is automatically loaded at the start of each run. Use `memory-recall` only for specific queries not covered by the auto-loaded context."
  - "Basic observations are recorded automatically at the end of each run. Use `memory-observe` during work only for high-value insights: architectural decisions, unexpected failures, non-obvious patterns."
- This reduces redundant tool calls and tokens

**Files changed:** `skill.ts`

**Acceptance criteria:**
- Skill clearly distinguishes automatic vs. manual memory operations
- Agents understand when to use tools vs. relying on automation

---

## Phase 4: Ecosystem (v0.6.0)

Cross-plugin integration, meta-analysis, and real-time UI.

### 4.1 Cross-Plugin Events

**Problem:** The plugin is a black box. Other plugins can't react to memory operations.

**Solution:**
- Emit via `ctx.events.emit()` at key moments:
  - `memory.observed` — after observe (payload: `{ category, project, memoryId }`)
  - `memory.consolidated` — after curator job (payload: `{ consolidated, compressed, forgotten, discarded }`)
  - `memory.recalled` — after recall (payload: `{ tokenCount, resultsCount, project }`)
  - `memory.recall.empty` — when recall returns 0 results (payload: `{ query, project }`)
  - `memory.forgotten` — after forget (payload: `{ memoryId, reason }`)
- Define event name constants in `constants.ts`

**Files changed:** `tools/recall.ts`, `tools/observe.ts`, `tools/forget.ts`, `curator.ts`, `worker.ts`, `constants.ts`

**Acceptance criteria:**
- All 5 event types are emitted at the correct moments
- Event payloads contain enough context for consumers to act
- Events are fire-and-forget (don't block the operation)

### 4.2 New Skill: Memory Reflection

**Problem:** Memory is write-heavy with no meta-analysis. Recurring failure patterns are never synthesized.

**Solution:**
- New managed skill `memory-reflection` registered in manifest
- Skill markdown instructs agents to run retrospective at milestone/project completion:
  1. Search all `"failure"` observations for the project
  2. Search all `"decision"` observations for the project
  3. Cross-reference: which decisions led to failures? Which patterns recurred?
  4. Synthesize into a `"pattern"` observation with the consolidated learning
  5. Report the reflection summary to the user
- Optional auto-trigger: subscribe to `project.updated` event; if project status changes to "completed", queue reflection as a curator task
- New setting: `enableAutoReflection` (default `false` — opt-in, as it's token-intensive)

**Files added:** `reflection.ts`
**Files changed:** `manifest.ts`, `worker.ts`, `constants.ts`, `settings.ts`

**Acceptance criteria:**
- Reflection skill is available to all agents
- Skill produces actionable synthesis, not just a list
- Auto-trigger on project completion is opt-in
- Reflection results are stored as `"pattern"` observations

### 4.3 Real-Time Dashboard via Streams

**Problem:** Dashboard widgets poll via `ctx.data`. Users must refresh to see updates.

**Solution:**
- Use `ctx.streams` to push SSE events when:
  - An observation is made (update memory count)
  - Curator runs (update stats)
  - Health status changes
- Stream event types: `memory.stats.updated`, `memory.health.changed`
- UI widgets subscribe to streams for real-time updates
- Fallback: keep `ctx.data` handlers (backward compatible for older Paperclip versions)

**Files changed:** `worker.ts` (emit streams), UI widget components

**Acceptance criteria:**
- Dashboard stats update in real-time without page refresh
- Widgets gracefully fall back to polling if streams are unavailable
- Stream events include full stat snapshot (not deltas)

---

## Settings Summary

New settings introduced across phases:

| Setting | Default | Phase | Description |
|---------|---------|-------|-------------|
| `enableAutoRecall` | `true` | 3 | Auto-load memory context at run start |
| `enableAutoObserve` | `true` | 3 | Auto-observe run summary at run end |
| `enableAutoReflection` | `false` | 4 | Auto-trigger reflection on project completion |

Existing settings unchanged. All new settings have safe defaults.

## Migration Path

- **v0.4.0 → v0.5.0:** No breaking changes. New tools are additive. Scoped memory auto-fills but doesn't override explicit values. Secrets are opt-in (`secret:` prefix). Logging is additive.
- **v0.5.0 → v0.6.0:** No breaking changes. Auto-recall/observe are on by default but can be disabled. Skill markdown changes are non-breaking (agents adapt). Events are fire-and-forget. Streams are additive alongside existing polling.

## SDK Assumptions to Verify

These assumptions about the Paperclip SDK must be verified before implementation. If any are incorrect, the affected phase needs adaptation.

| Assumption | Phase | Fallback if wrong |
|---|---|---|
| `ctx.jobs.register(name, handler)` accepts a cron/interval config | 1.1 | Use `setInterval` in `setup()` with manual company iteration |
| `ctx.state` supports `run` scope for per-run ephemeral data | 3.1, 3.2 | Use an in-memory `Map<runId, data>` with TTL cleanup |
| `ctx.events.emit()` exists for publishing custom events | 4.1 | Skip cross-plugin events; log-only |
| `ctx.streams` supports pushing SSE to UI widgets | 4.3 | Keep polling-only via `ctx.data` |
| `ctx.secrets.resolve()` exists and accepts string references | 1.3 | Keep plain-text only; document as future work |
| `runCtx` in tool handlers includes `projectId` and `issueId` | 2.2, 3.1 | Extract from issue via `ctx.issues.get()` using available IDs |
| `agent.run.started` / `agent.run.finished` event payloads include `runId`, `issueId`, `projectId` | 3.1, 3.2 | Query `ctx.agents` or `ctx.issues` to resolve missing fields |
| agentmemory API has a `/agentmemory/forget` endpoint (or equivalent DELETE) | 2.1 | POST to `/agentmemory/observe` with a "retraction" hookType |

## Dependencies

- **agentmemory service:** All features depend on the external agentmemory service. No offline fallback.
- **Paperclip SDK 2026.525.0+:** Current version. Phases 3-4 may require newer SDK if `ctx.state` run scope or `ctx.events.emit` are not available in this version.
- **recall/search must return `memoryId`:** Phase 2.1 (`memory-forget`) requires that recall and search results include a memory ID. Currently results have `source` but may not have `id`. If the agentmemory API doesn't return IDs in search results, this must be resolved upstream or the forget tool must accept content-based matching instead.

## Non-Goals

- **Local caching/fallback** — the plugin remains a client to agentmemory service. Offline mode is out of scope.
- **Custom memory UI** — no memory browser or editor in the settings page. The agentmemory service's own UI handles that.
- **Multi-model token counting** — `CHARS_PER_TOKEN = 4` estimate remains. Accurate per-model tokenization is out of scope.
- **Agent-to-agent memory sharing** — all agents in a company share the same namespace. Per-agent isolation is out of scope.
