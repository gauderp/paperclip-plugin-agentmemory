# paperclip-plugin-agentmemory

Memory-as-Skill plugin for [Paperclip](https://github.com/paperclipai/paperclip). Gives every agent persistent memory — recall context, observe decisions, and search history — with configurable token budget enforcement.

## Features

- **3 Agent Tools** — `memory-recall`, `memory-observe`, `memory-search` available to all agents
- **Managed Skill** — injects memory protocol into every agent automatically
- **Curator Agent** — consolidates observations, compresses history, cleans expired data
- **Token Budget** — memory injection capped at a configurable % of context window (default 40%)
- **Knowledge Graph** — optional entity/relation extraction via agentmemory
- **Dashboard Widgets** — health status + memory stats (memories count, graph nodes/edges)
- **Settings Page** — full configuration UI (connection, budget, curator, graph toggles)

## Requirements

- A [Paperclip](https://github.com/paperclipai/paperclip) instance with plugin runtime
- A running [agentmemory](https://www.agent-memory.dev/) service (default `http://127.0.0.1:3111`)

## Installation

### Via Paperclip UI

1. Open your Paperclip instance in the browser
2. Go to **Settings > Plugins**
3. Click **Install Plugin**
4. Enter the package name: `paperclip-plugin-agentmemory`
5. Click **Install**
6. After installation, go to **Settings > Agent Memory** to configure the connection

### Via CLI

```bash
# Install from npm
paperclip plugin install paperclip-plugin-agentmemory

# Verify installation
paperclip plugin inspect customizar.agentmemory

# Or install with explicit API base
paperclip plugin install paperclip-plugin-agentmemory --api-base http://127.0.0.1:3100
```

### From Source (local development)

```bash
git clone https://github.com/gauderp/paperclip-plugin-agentmemory.git
cd paperclip-plugin-agentmemory
npm install
npm run build
npm test

# Install locally into your Paperclip instance
paperclip plugin install "$(pwd)"
```

## Configuration

After installing, configure the plugin under **Settings > Agent Memory** in the Paperclip UI.

### Connection Settings

| Setting | Default | Description |
|---------|---------|-------------|
| AgentMemory URL | `http://127.0.0.1:3111` | URL of the agentmemory service |
| Memory Namespace | *(company ID)* | Namespace for memory isolation |
| Bearer Token | *(empty)* | Auth token (optional for localhost) |

### Memory Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Context Window (tokens) | `128000` | Context window size of the model used by agents |
| Memory Budget (%) | `40` | Max % of context window for memory injection |
| Default Search Limit | `20` | Max results per search query |
| Curator Interval (hours) | `6` | How often the curator runs consolidation |
| Auto-Forget (days) | `30` | Remove consolidated observations after N days |
| Sketch TTL (days) | `14` | Discard unpromoted sketches after N days |
| Knowledge Graph | `false` | Extract entities/relations automatically |
| Auto-Consolidate | `true` | Consolidate memory after an issue is completed |

## Usage

### 1. Start agentmemory

The plugin requires a running [agentmemory](https://www.agent-memory.dev/) service:

```bash
npx agentmemory
# Runs at http://127.0.0.1:3111
```

### 2. Configure the connection

Go to **Settings > Agent Memory** in the Paperclip UI:

1. Set the **AgentMemory URL** (default `http://127.0.0.1:3111`)
2. Leave **Memory Namespace** empty to use the company ID
3. Leave **Bearer Token** empty for localhost
4. Click **Save**, then **Test connection** — status should show "ok"

### 3. Automatic setup

On startup, the plugin automatically:
- Injects the **Agent Memory** skill into all agents
- Creates the **Memory Curator** agent for each company

No manual action needed — all agents immediately gain memory capabilities.

### 4. How agents use memory

Any agent with the skill receives 3 tools:

**At the start of each task** — the agent calls `memory-recall` to receive relevant context (prior decisions, known patterns, past failures). This saves tokens by avoiding re-reading files and re-investigating solved problems.

**During work** — the agent calls `memory-observe` to capture insights:
- `"decision"` — architectural or design decisions made
- `"discovery"` — non-obvious findings
- `"pattern"` — recurring patterns identified
- `"failure"` — unexpected failures and root causes

**When in doubt** — the agent calls `memory-search` to check "have we tried this before?" or "how did we solve X last time?" before investigating from scratch.

### 5. Token budget

The `memory-recall` tool never injects more than **40%** of the context window (configurable in settings). Results are ranked by relevance (hybrid BM25 + vector + knowledge graph search) and truncated at the budget. The agent receives a `tokenCount` field so it knows exactly how much context was consumed.

### 6. Automatic curation

After an issue is marked as `done` or `completed`, the curator agent automatically:
- Consolidates raw observations into compact crystals
- Compresses history via flow compression
- Auto-forgets observations older than the configured threshold
- Garbage-collects unpromoted sketches
- Extracts knowledge graph entities/relations (if enabled)

### 7. Dashboard

Two widgets appear on the Paperclip dashboard:
- **Agent Memory Health** — connection status with the agentmemory service
- **Agent Memory Stats** — count of active memories, graph nodes, and graph edges

## Agent Tools Reference

### `memory-recall`

Recall relevant context from persistent memory before starting a task.

```
Input:  { query: string, project?: string, maxTokens?: number }
Output: { context: string, tokenCount: number, sources: string[] }
```

### `memory-observe`

Store an observation into persistent memory.

```
Input:  { observation: string, category: "decision"|"discovery"|"pattern"|"failure", project?: string }
Output: { stored: boolean, id: string }
```

### `memory-search`

Search persistent memory for specific information.

```
Input:  { query: string, project?: string, limit?: number }
Output: { results: Array<{ content: string, score: number, source: string }> }
```

## Development

```bash
npm run dev        # Watch mode (rebuilds on change)
npm run build      # Production build
npm test           # Run tests (vitest)
npm run typecheck  # TypeScript check
```

### Windows (agentmemory sidecar)

On Windows, prefer `127.0.0.1` over `localhost` (Node may resolve to `::1` while the service binds `127.0.0.1`).

```powershell
# Start agentmemory and wait for health
npm run start:windows

# Smoke test (health, observe, search)
npm run verify:windows
```

Set `AGENTMEMORY_URL=http://127.0.0.1:3111` when running outside these scripts.

## Plugin Manifest

| Field | Value |
|-------|-------|
| Plugin ID | `customizar.agentmemory` |
| Version | `0.4.0` |
| Category | `connector` |
| Default URL | `http://127.0.0.1:3111` |

## License

MIT
