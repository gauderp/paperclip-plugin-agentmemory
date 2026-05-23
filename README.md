# @gaud_erp/paperclip-plugin-agentmemory

Paperclip connector plugin for local [agentmemory](https://www.agent-memory.dev/) — company-scoped base URL, memory namespace, optional bearer token, and a health probe against `GET /agentmemory/health`.

## Features

- Per-company settings: base URL, memory namespace, optional bearer token
- Health probe via `http.outbound` (`probe-health` action)
- Dashboard health widget and **Agent Memory** settings page in the host UI

## Requirements

- Paperclip instance with plugin runtime
- A running agentmemory stack reachable from the Paperclip worker (default `http://127.0.0.1:3111`)

## Repository

Source: [gauderp/paperclip-plugin-agentmemory](https://github.com/gauderp/paperclip-plugin-agentmemory)

## Local development

```bash
git clone https://github.com/gauderp/paperclip-plugin-agentmemory.git
cd paperclip-plugin-agentmemory
npm install
npm run build
npm test
npm run typecheck
paperclipai plugin install "$(pwd)"
```

Start agentmemory locally before expecting a green health status in the Paperclip UI.

### Windows (Docker + worker)

On Windows, prefer `127.0.0.1` over `localhost` for the agentmemory HTTP port (Node may resolve `localhost` to `::1` while Docker binds `127.0.0.1` only). Helper scripts under `scripts/`:

```powershell
# Terminal 1 — start stack and wait for /agentmemory/health
npm run start:windows

# Terminal 2 — smoke (health, livez, observe, smart-search)
npm run verify:windows
```

Set `AGENTMEMORY_URL=http://127.0.0.1:3111` when running the worker outside these scripts.

## Production install (npm)

After the first npm release (`@gaud_erp/paperclip-plugin-agentmemory` on [npmjs](https://www.npmjs.com/package/@gaud_erp/paperclip-plugin-agentmemory)):

```bash
paperclipai plugin install @gaud_erp/paperclip-plugin-agentmemory@0.1.0 --api-base http://127.0.0.1:3100
paperclipai plugin inspect customizar.agentmemory --api-base http://127.0.0.1:3100
```

Configure base URL and namespace under **Agent Memory** in the Paperclip sidebar.

## Build

```bash
npm run typecheck
npm test
npm run build
```

`prepublishOnly` runs `build` automatically before `npm publish`.

## Manifest

- Plugin id: `customizar.agentmemory`
- Default base URL: `http://127.0.0.1:3111`
- Health path: `/agentmemory/health`
