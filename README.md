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

## How It Works

### Agent Memory Protocol

Every agent receives a managed skill that teaches the memory protocol:

1. **At task start** — call `memory-recall` with a description of the task. The agent receives relevant prior context (decisions, patterns, failures) without re-reading files or re-investigating.

2. **During work** — call `memory-observe` to capture:
   - `"decision"` — architectural or design decisions
   - `"discovery"` — non-obvious findings
   - `"pattern"` — recurring patterns identified
   - `"failure"` — unexpected failures and root causes

3. **When in doubt** — call `memory-search` to check "have we tried this before?" or "how did we solve X?"

### Budget Engine

The budget engine ensures memory never overwhelms the context window:

```
availableBudget = (contextWindow × budgetPercent) - toolOverhead
```

Results from `memory-recall` are ranked by relevance and truncated at the budget. The agent receives `tokenCount` so it knows exactly how much context was consumed.

### Curator Agent

A managed curator agent runs periodically (configurable) and after issues are completed:

- Consolidates raw observations into compact crystals
- Compresses history via flow compression
- Auto-forgets observations older than the configured threshold
- Garbage-collects unpromoted sketches
- Extracts knowledge graph entities/relations (if enabled)

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
| Version | `0.2.0` |
| Category | `connector` |
| Default URL | `http://127.0.0.1:3111` |

## License

MIT
