# Agent Memory Plugin v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade agentmemory plugin from v0.4.0 to v0.6.0 across 4 phases: infrastructure hardening, new tools with scoped memory, automation of recall/observe, and cross-plugin ecosystem integration.

**Architecture:** Layer-by-layer approach. Phase 1 adds the plumbing (logging, jobs, secrets) that all later phases depend on. Phase 2 adds tools and scoping. Phase 3 wires automation via SDK events. Phase 4 emits events, adds reflection skill, and real-time streams.

**Tech Stack:** TypeScript, Paperclip Plugin SDK 2026.525.0, vitest, esbuild

**Spec:** `docs/superpowers/specs/2026-05-29-agentmemory-v2-design.md`

---

## File Map

### Files to Create

| File | Responsibility |
|------|----------------|
| `src/tools/forget.ts` | `memory-forget` tool handler |
| `src/reflection.ts` | Memory Reflection skill content + reconcile |
| `src/logger.ts` | Thin logger wrapper type for dependency injection |
| `src/events.ts` | Event emission helpers + constants |
| `tests/forget.spec.ts` | Tests for memory-forget tool |
| `tests/logger.spec.ts` | Tests for logger behavior |
| `tests/events.spec.ts` | Tests for event emission |
| `tests/scoped.spec.ts` | Tests for scoped memory behavior |
| `tests/automation.spec.ts` | Tests for auto-recall/observe |

### Files to Modify

| File | Changes |
|------|---------|
| `src/constants.ts` | New paths, tool keys, event names, skill/job keys |
| `src/settings.ts` | New settings fields, secrets resolution |
| `src/agentmemory-client.ts` | `forget()` method, logger injection, issue metadata |
| `src/worker.ts` | Job registration, event subscriptions, logger/activity/events wiring |
| `src/manifest.ts` | New tool, job, skill, capabilities |
| `src/skill.ts` | Updated markdown (forget, scoping, hybrid mode) |
| `src/curator.ts` | Logger injection, activity logging |
| `src/health.ts` | Logger injection |
| `src/budget.ts` | No changes |
| `src/tools/recall.ts` | Activity log, scoped search, auto-recall cache, events |
| `src/tools/observe.ts` | Activity log, auto-tag project, observe counter, events |
| `src/tools/search.ts` | Activity log, scoped search, events |
| `tests/tools.spec.ts` | Updated tool handler signatures |
| `tests/agentmemory-client.spec.ts` | Test for `forget()` method |
| `tests/plugin.spec.ts` | Test for job, new tool, new capabilities |

---

## Phase 1: Infrastructure (v0.5.0)

### Task 1: Logger Type & Injection

Introduce a logger type that tool handlers and helpers accept via dependency injection, replacing silent `.catch(() => {})`.

**Files:**
- Create: `src/logger.ts`
- Create: `tests/logger.spec.ts`
- Modify: `src/agentmemory-client.ts:37-59`
- Modify: `src/curator.ts:59-85`
- Modify: `src/health.ts:42-43`
- Modify: `src/worker.ts:30-217`

- [ ] **Step 1: Write the logger type test**

```ts
// tests/logger.spec.ts
import { describe, expect, it, vi } from "vitest";
import type { PluginLogger } from "../src/logger.js";
import { noopLogger } from "../src/logger.js";

describe("PluginLogger", () => {
  it("noopLogger does not throw", () => {
    expect(() => noopLogger.info("test")).not.toThrow();
    expect(() => noopLogger.warn("test", { err: new Error("x") })).not.toThrow();
    expect(() => noopLogger.error("test", { err: new Error("x") })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/logger.spec.ts`
Expected: FAIL — module `../src/logger.js` not found

- [ ] **Step 3: Create logger module**

```ts
// src/logger.ts
export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: PluginLogger = {
  info() {},
  warn() {},
  error() {},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/logger.spec.ts`
Expected: PASS

- [ ] **Step 5: Inject logger into AgentmemoryClient**

Replace the `AgentmemoryClient` class in `src/agentmemory-client.ts`:

```ts
// Add import at top
import type { PluginLogger } from "./logger.js";
import { noopLogger } from "./logger.js";

export class AgentmemoryClient {
  constructor(
    private http: HttpLike,
    private baseUrl: string,
    private namespace: string,
    private bearerToken?: string,
    private logger: PluginLogger = noopLogger,
  ) {}

  // ... headers() unchanged ...

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.http.fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const msg = `agentmemory responded ${response.status} at ${path}`;
      this.logger.error(msg, { status: response.status, path });
      throw new Error(msg);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.http.fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      const msg = `agentmemory responded ${response.status} at ${path}`;
      this.logger.error(msg, { status: response.status, path });
      throw new Error(msg);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  // ... rest of methods unchanged ...
}
```

- [ ] **Step 6: Replace silent catches in curator.ts**

In `src/curator.ts`, update `runCuratorJob` to accept and use logger:

```ts
import type { PluginLogger } from "./logger.js";
import { noopLogger } from "./logger.js";

export async function runCuratorJob(
  client: AgentmemoryClient,
  settings: AgentmemoryFullSettings,
  logger: PluginLogger = noopLogger,
): Promise<{ consolidated: number; compressed: number; forgotten: number; discarded: number; extracted: number }> {
  const [consolidateResult, compressResult, forgetResult, gcResult] = await Promise.all([
    client.consolidate().catch((err) => { logger.warn("consolidate failed", { err }); return { consolidated: 0 }; }),
    client.flowCompress().catch((err) => { logger.warn("flowCompress failed", { err }); return { compressed: 0 }; }),
    client.autoForget(settings.autoForgetDays).catch((err) => { logger.warn("autoForget failed", { err }); return { forgotten: 0 }; }),
    client.sketchesGc(settings.sketchTTLDays).catch((err) => { logger.warn("sketchesGc failed", { err }); return { discarded: 0 }; }),
  ]);

  let extracted = 0;
  if (settings.enableKnowledgeGraph) {
    const graphResult = await client.graphExtract().catch((err) => { logger.warn("graphExtract failed", { err }); return { extracted: 0 }; });
    extracted = graphResult.extracted;
  }

  await client.autoCrystallize().catch((err) => { logger.warn("autoCrystallize failed", { err }); });

  return {
    consolidated: consolidateResult.consolidated,
    compressed: compressResult.compressed,
    forgotten: forgetResult.forgotten,
    discarded: gcResult.discarded,
    extracted,
  };
}
```

- [ ] **Step 7: Replace silent catch in health.ts**

In `src/health.ts`, line 42-43, replace:

```ts
    } catch {
      body = null;
    }
```

with:

```ts
    } catch (parseErr) {
      body = null;
    }
```

(Health probe already handles errors at the outer try/catch — no logger needed here since parse failure is expected for non-JSON responses.)

- [ ] **Step 8: Wire logger in worker.ts**

In `src/worker.ts`, update `buildClient` to accept logger:

```ts
import type { PluginLogger } from "./logger.js";
import { noopLogger } from "./logger.js";

function buildClient(
  http: { fetch(url: string, init?: RequestInit): Promise<Response> },
  settings: AgentmemoryFullSettings,
  logger: PluginLogger = noopLogger,
): AgentmemoryClient {
  return new AgentmemoryClient(
    http,
    settings.baseUrl,
    settings.memoryNamespace,
    settings.bearerToken,
    logger,
  );
}
```

In the `setup()` function, capture the logger:

```ts
async setup(ctx) {
    const logger: PluginLogger = ctx.logger ?? noopLogger;
    logger.info("agentmemory plugin setup started");
```

Update all `buildClient` calls inside `setup()` to pass `logger`:

```ts
const client = buildClient(ctx.http, settings, logger);
```

At end of `setup()`, add:

```ts
    logger.info("agentmemory plugin setup complete");
```

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass. New logger test passes.

- [ ] **Step 10: Commit**

```bash
git add src/logger.ts tests/logger.spec.ts src/agentmemory-client.ts src/curator.ts src/health.ts src/worker.ts
git commit -m "feat: add structured logging, replace silent catches"
```

---

### Task 2: Activity Logging in Tool Handlers

Add `ctx.activity.log()` to each tool handler so operations appear in Paperclip's activity feed.

**Files:**
- Modify: `src/tools/recall.ts`
- Modify: `src/tools/observe.ts`
- Modify: `src/tools/search.ts`
- Modify: `src/worker.ts`
- Modify: `tests/tools.spec.ts`

- [ ] **Step 1: Update tool handler tests to expect activity logger**

In `tests/tools.spec.ts`, add an activity mock and update tests:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleRecall } from "../src/tools/recall.js";
import { handleObserve } from "../src/tools/observe.js";
import { handleSearch } from "../src/tools/search.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

function mockClient(overrides: Partial<AgentmemoryClient> = {}): AgentmemoryClient {
  return {
    smartSearch: vi.fn(async () => [
      { content: "prior decision about caching", score: 0.95, source: "crystal-1" },
      { content: "auth pattern uses JWT", score: 0.80, source: "obs-42" },
    ]),
    observe: vi.fn(async () => ({ stored: true, id: "obs-new" })),
    createSketch: vi.fn(async () => ({ id: "sk-new" })),
    ...overrides,
  } as unknown as AgentmemoryClient;
}

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("memory-recall tool", () => {
  it("returns context string and token count within budget", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleRecall(client, {
      query: "how does caching work?",
      maxTokens: 50_000,
    }, activity);

    expect(result.context).toContain("prior decision about caching");
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeLessThanOrEqual(50_000);
    expect(result.sources).toEqual(["crystal-1", "obs-42"]);
  });

  it("logs activity with result count and token count", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleRecall(client, { query: "caching", maxTokens: 50_000 }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Recalled 2 memories") }),
    );
  });

  it("respects maxTokens budget", async () => {
    const client = mockClient({
      smartSearch: vi.fn(async () => [
        { content: "a".repeat(2000), score: 0.9, source: "s1" },
        { content: "b".repeat(2000), score: 0.8, source: "s2" },
      ]),
    });
    const activity = mockActivity();
    const result = await handleRecall(client, { query: "test", maxTokens: 600 }, activity);
    expect(result.sources).toHaveLength(1);
  });
});

describe("memory-observe tool", () => {
  it("stores observation and creates sketch", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleObserve(client, {
      observation: "caching layer needs TTL",
      category: "discovery",
    }, activity);

    expect(result.stored).toBe(true);
    expect(result.id).toBe("obs-new");
    expect(client.observe).toHaveBeenCalled();
    expect(client.createSketch).toHaveBeenCalled();
  });

  it("logs activity with category and observation", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleObserve(client, {
      observation: "caching layer needs TTL",
      category: "discovery",
    }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("discovery") }),
    );
  });

  it("passes project when provided", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleObserve(client, {
      observation: "test",
      category: "decision",
      project: "my-proj",
    }, activity);

    expect(client.observe).toHaveBeenCalledWith("test", "decision", "my-proj");
  });
});

describe("memory-search tool", () => {
  it("returns discrete results with scores", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleSearch(client, { query: "JWT pattern", limit: 5 }, activity);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].score).toBe(0.95);
    expect(client.smartSearch).toHaveBeenCalledWith("JWT pattern", 5, undefined);
  });

  it("logs activity with query and result count", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleSearch(client, { query: "JWT pattern" }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("JWT pattern") }),
    );
  });

  it("defaults limit to 10", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleSearch(client, { query: "test" }, activity);

    expect(client.smartSearch).toHaveBeenCalledWith("test", 10, undefined);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools.spec.ts`
Expected: FAIL — `ActivityLogger` type not exported, handlers don't accept activity param

- [ ] **Step 3: Update recall handler with activity logging**

```ts
// src/tools/recall.ts
import type { AgentmemoryClient } from "../agentmemory-client.js";
import { truncateToTokenBudget } from "../budget.js";

export type ActivityLogger = {
  log(entry: { message: string; metadata?: Record<string, unknown> }): Promise<void>;
};

const noopActivity: ActivityLogger = { log: async () => {} };

export type RecallInput = {
  query: string;
  project?: string;
  maxTokens?: number;
};

export type RecallOutput = {
  context: string;
  tokenCount: number;
  sources: string[];
};

export async function handleRecall(
  client: AgentmemoryClient,
  input: RecallInput,
  activity: ActivityLogger = noopActivity,
): Promise<RecallOutput> {
  const maxTokens = input.maxTokens ?? 48_200;
  const rawResults = await client.smartSearch(input.query, 50, input.project);

  const scored = rawResults.map((r) => ({
    content: r.content,
    score: r.score,
    source: r.source ?? "unknown",
  }));

  const { items, tokenCount } = truncateToTokenBudget(scored, maxTokens);

  const context = items.map((item) => item.content).join("\n\n---\n\n");
  const sources = items.map((item) => item.source);

  await activity.log({
    message: `Recalled ${items.length} memories (${tokenCount} tokens)${input.project ? ` for project ${input.project}` : ""}`,
    metadata: { tokenCount, resultCount: items.length, project: input.project },
  });

  return { context, tokenCount, sources };
}
```

- [ ] **Step 4: Update observe handler with activity logging**

```ts
// src/tools/observe.ts
import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type ObserveInput = {
  observation: string;
  category: "decision" | "discovery" | "pattern" | "failure";
  project?: string;
};

export type ObserveOutput = {
  stored: boolean;
  id: string;
};

export async function handleObserve(
  client: AgentmemoryClient,
  input: ObserveInput,
  activity: ActivityLogger = noopActivity,
): Promise<ObserveOutput> {
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, input.project),
    client.createSketch(input.observation, input.category),
  ]);

  const truncated = input.observation.length > 80
    ? input.observation.slice(0, 77) + "..."
    : input.observation;

  await activity.log({
    message: `Observed ${input.category}: ${truncated}`,
    metadata: { category: input.category, project: input.project, memoryId: obsResult.id },
  });

  return { stored: obsResult.stored, id: obsResult.id };
}
```

- [ ] **Step 5: Update search handler with activity logging**

```ts
// src/tools/search.ts
import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type SearchInput = {
  query: string;
  project?: string;
  limit?: number;
};

export type SearchOutput = {
  results: Array<{ content: string; score: number; source: string }>;
};

export async function handleSearch(
  client: AgentmemoryClient,
  input: SearchInput,
  activity: ActivityLogger = noopActivity,
): Promise<SearchOutput> {
  const limit = input.limit ?? 10;
  const rawResults = await client.smartSearch(input.query, limit, input.project);

  const results = rawResults.map((r) => ({
    content: r.content,
    score: r.score,
    source: r.source ?? "unknown",
  }));

  await activity.log({
    message: `Searched memory for '${input.query}' — ${results.length} results`,
    metadata: { query: input.query, resultCount: results.length, project: input.project },
  });

  return { results };
}
```

- [ ] **Step 6: Wire activity in worker.ts tool registrations**

In `src/worker.ts`, create an activity adapter and pass to handlers. Inside `setup()`, after capturing logger, add:

```ts
function activityFor(companyId: string): ActivityLogger {
  return {
    log: (entry) => ctx.activity.log({ companyId, ...entry }),
  };
}
```

Update each tool registration to pass activity. Example for recall:

```ts
async (params, runCtx) => {
  const p = params as Record<string, unknown>;
  const settings = await readCompanySettings(ctx, runCtx.companyId);
  const client = buildClient(ctx.http, settings, logger);
  const budget = calculateBudget(settings.contextWindowSize, settings.memoryBudgetPercent);
  const activity = activityFor(runCtx.companyId);
  const result = await handleRecall(client, {
    query: String(p.query ?? ""),
    project: p.project ? String(p.project) : undefined,
    maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : budget,
  }, activity);
  return { data: result };
},
```

Apply same pattern to observe and search handlers.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/tools/recall.ts src/tools/observe.ts src/tools/search.ts src/worker.ts tests/tools.spec.ts
git commit -m "feat: add activity logging to all tool handlers"
```

---

### Task 3: Curator Scheduled Job

Register a real job so the curator runs on a schedule, not only on `issue.updated`.

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/manifest.ts`
- Modify: `src/worker.ts`
- Modify: `src/curator.ts`
- Modify: `tests/plugin.spec.ts`

- [ ] **Step 1: Write test for curator job registration**

Add to `tests/plugin.spec.ts`:

```ts
it("declares curator job in manifest", () => {
  expect(manifest.jobs).toBeDefined();
  const jobs = manifest.jobs as any[];
  expect(jobs).toHaveLength(1);
  expect(jobs[0].jobKey).toBe("curator-cycle");
});

it("runs curator job via harness", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ consolidated: 2, compressed: 1, forgotten: 0, discarded: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities, "companies.read"] });
  harness.seed({ companies: [{ id: COMPANY_ID, name: "Test Co" }] });
  await plugin.definition.setup(harness.ctx);

  await harness.performAction("save-company-settings", {
    companyId: COMPANY_ID,
    settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID },
  });

  await harness.runJob("curator-cycle", { companyId: COMPANY_ID });

  expect(harness.activity.length).toBeGreaterThan(0);
  expect(harness.activity.some((a: any) => a.message.includes("Curator"))).toBe(true);
}, 10000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin.spec.ts`
Expected: FAIL — `manifest.jobs` undefined, `runJob` fails because no job registered

- [ ] **Step 3: Add job key constant**

In `src/constants.ts`, add:

```ts
export const JOB_KEYS = {
  curatorCycle: "curator-cycle",
} as const;
```

- [ ] **Step 4: Add job declaration to manifest**

In `src/manifest.ts`, import `JOB_KEYS` and add `jobs` array after `agents`:

```ts
import { JOB_KEYS } from "./constants.js";

// Inside the manifest object, after agents array:
jobs: [
  {
    jobKey: JOB_KEYS.curatorCycle,
    displayName: "Memory Curator Cycle",
    description: "Consolidates observations, compresses history, cleans expired data.",
    schedule: "0 */6 * * *", // every 6 hours
  },
],
```

- [ ] **Step 5: Register job handler in worker.ts**

In `src/worker.ts`, import `JOB_KEYS` and add job registration inside `setup()`:

```ts
import { JOB_KEYS } from "./constants.js";

// Inside setup(), after tool registrations:
ctx.jobs.register(JOB_KEYS.curatorCycle, async (job) => {
  logger.info("curator job started", { trigger: job.trigger, runId: job.runId });
  const companies = await ctx.companies.list();
  for (const company of companies) {
    try {
      const settings = await readCompanySettings(ctx, company.id);
      const client = buildClient(ctx.http, settings, logger);
      const activity = activityFor(company.id);
      const result = await runCuratorJob(client, settings, logger);
      await activity.log({
        message: `Curator: consolidated ${result.consolidated}, compressed ${result.compressed}, forgotten ${result.forgotten}, discarded ${result.discarded}`,
        metadata: result,
      });
    } catch (err) {
      logger.error("curator job failed for company", { companyId: company.id, err });
    }
  }
  logger.info("curator job completed");
});
```

- [ ] **Step 6: Add activity logging to the issue.updated curator trigger**

In the existing `issue.updated` event handler in `src/worker.ts`, add activity logging after `runCuratorJob`:

```ts
ctx.events.on("issue.updated", async (event) => {
  const companyId = event.companyId;
  if (!companyId) return;
  const payload = event.payload as Record<string, unknown> | undefined;
  const status = payload?.status as string | undefined;
  if (status !== "done" && status !== "completed") return;
  const settings = await readCompanySettings(ctx, companyId);
  if (!settings.enableAutoConsolidate) return;
  const client = buildClient(ctx.http, settings, logger);
  const activity = activityFor(companyId);
  const result = await runCuratorJob(client, settings, logger).catch((err) => {
    logger.warn("curator failed on issue.updated", { companyId, err });
    return null;
  });
  if (result) {
    await activity.log({
      message: `Curator (issue completed): consolidated ${result.consolidated}, compressed ${result.compressed}`,
      metadata: result,
    });
  }
});
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass including new job test

- [ ] **Step 8: Commit**

```bash
git add src/constants.ts src/manifest.ts src/worker.ts src/curator.ts tests/plugin.spec.ts
git commit -m "feat: register curator as scheduled job (every 6h)"
```

---

### Task 4: Secrets Resolution for Bearer Token

Support `secret:ref-name` prefix to resolve bearer tokens via SDK secrets API.

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/manifest.ts`
- Modify: `src/worker.ts`
- Modify: `tests/plugin.spec.ts`

- [ ] **Step 1: Write test for secret resolution**

Add to `tests/plugin.spec.ts`:

```ts
import { resolveToken } from "../src/settings.js";

describe("secret token resolution", () => {
  it("returns plain-text token as-is", async () => {
    const result = await resolveToken("my-plain-token");
    expect(result).toBe("my-plain-token");
  });

  it("returns undefined for empty token", async () => {
    const result = await resolveToken(undefined);
    expect(result).toBeUndefined();
  });

  it("resolves secret: prefixed token via resolver", async () => {
    const resolver = vi.fn(async (ref: string) => "resolved-secret-value");
    const result = await resolveToken("secret:my-secret", resolver);
    expect(resolver).toHaveBeenCalledWith("my-secret");
    expect(result).toBe("resolved-secret-value");
  });

  it("falls back to raw value if resolver fails", async () => {
    const resolver = vi.fn(async () => { throw new Error("not found"); });
    const result = await resolveToken("secret:bad-ref", resolver);
    expect(result).toBe("secret:bad-ref");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin.spec.ts`
Expected: FAIL — `resolveToken` not exported

- [ ] **Step 3: Implement resolveToken in settings.ts**

Add to `src/settings.ts`:

```ts
export async function resolveToken(
  token: string | undefined,
  secretsResolver?: (ref: string) => Promise<string>,
): Promise<string | undefined> {
  if (!token || token.trim().length === 0) return undefined;
  if (token.startsWith("secret:") && secretsResolver) {
    const ref = token.slice("secret:".length);
    try {
      return await secretsResolver(ref);
    } catch {
      return token; // fallback to raw value
    }
  }
  return token;
}
```

- [ ] **Step 4: Add secrets capability to manifest**

In `src/manifest.ts`, add to `capabilities` array:

```ts
"secrets.read-ref",
```

- [ ] **Step 5: Wire secret resolution in worker.ts buildClient**

In `src/worker.ts`, update `buildClient` to be async and resolve secrets:

```ts
async function buildClientWithSecrets(
  ctx: PluginContext,
  settings: AgentmemoryFullSettings,
  logger: PluginLogger = noopLogger,
): Promise<AgentmemoryClient> {
  const token = await resolveToken(
    settings.bearerToken,
    ctx.secrets?.resolve?.bind(ctx.secrets),
  );
  return new AgentmemoryClient(
    ctx.http,
    settings.baseUrl,
    settings.memoryNamespace,
    token,
    logger,
  );
}
```

Keep original `buildClient` for sync contexts (tests), and use `buildClientWithSecrets` in tool handlers and job handler where async is available. Update each tool handler call from `buildClient(ctx.http, settings, logger)` to `await buildClientWithSecrets(ctx, settings, logger)`.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/settings.ts src/manifest.ts src/worker.ts tests/plugin.spec.ts
git commit -m "feat: support secret: prefix for bearer token resolution"
```

---

## Phase 2: Tools & Scoped Memory (v0.5.0)

### Task 5: memory-forget Tool

New tool for agents to remove outdated or incorrect memories.

**Files:**
- Create: `src/tools/forget.ts`
- Create: `tests/forget.spec.ts`
- Modify: `src/constants.ts`
- Modify: `src/agentmemory-client.ts`
- Modify: `src/manifest.ts`
- Modify: `src/worker.ts`
- Modify: `tests/agentmemory-client.spec.ts`

- [ ] **Step 1: Write test for forget tool handler**

```ts
// tests/forget.spec.ts
import { describe, expect, it, vi } from "vitest";
import { handleForget } from "../src/tools/forget.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

function mockClient(): AgentmemoryClient {
  return {
    forget: vi.fn(async () => ({ forgotten: true })),
  } as unknown as AgentmemoryClient;
}

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("memory-forget tool", () => {
  it("calls client.forget with memoryId", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleForget(client, { memoryId: "obs-42" }, activity);

    expect(client.forget).toHaveBeenCalledWith("obs-42");
    expect(result.forgotten).toBe(true);
  });

  it("logs activity with memoryId and reason", async () => {
    const client = mockClient();
    const activity = mockActivity();
    await handleForget(client, { memoryId: "obs-42", reason: "outdated info" }, activity);

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("obs-42"),
        metadata: expect.objectContaining({ reason: "outdated info" }),
      }),
    );
  });

  it("works without reason", async () => {
    const client = mockClient();
    const activity = mockActivity();
    const result = await handleForget(client, { memoryId: "obs-1" }, activity);
    expect(result.forgotten).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/forget.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add forget constant and client method**

In `src/constants.ts`, add:

```ts
export const FORGET_PATH = "/agentmemory/forget";
```

Update `TOOL_KEYS`:

```ts
export const TOOL_KEYS = {
  recall: "memory-recall",
  observe: "memory-observe",
  search: "memory-search",
  forget: "memory-forget",
} as const;
```

In `src/agentmemory-client.ts`, add method:

```ts
import { FORGET_PATH } from "./constants.js";

// Inside AgentmemoryClient class:
async forget(memoryId: string): Promise<{ forgotten: boolean }> {
  return this.post(FORGET_PATH, {
    memoryId,
    namespace: this.namespace,
  });
}
```

- [ ] **Step 4: Write test for client.forget**

Add to `tests/agentmemory-client.spec.ts`:

```ts
it("forget sends POST to forget endpoint", async () => {
  const http = mockHttp({ forgotten: true });
  const client = new AgentmemoryClient(http as any, "http://127.0.0.1:3111", "ns");

  const result = await client.forget("obs-42");

  expect(http.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:3111/agentmemory/forget",
    expect.objectContaining({ method: "POST" }),
  );
  expect(result.forgotten).toBe(true);
});
```

- [ ] **Step 5: Implement forget handler**

```ts
// src/tools/forget.ts
import type { AgentmemoryClient } from "../agentmemory-client.js";
import type { ActivityLogger } from "./recall.js";

const noopActivity: ActivityLogger = { log: async () => {} };

export type ForgetInput = {
  memoryId: string;
  reason?: string;
};

export type ForgetOutput = {
  forgotten: boolean;
};

export async function handleForget(
  client: AgentmemoryClient,
  input: ForgetInput,
  activity: ActivityLogger = noopActivity,
): Promise<ForgetOutput> {
  const result = await client.forget(input.memoryId);

  await activity.log({
    message: `Forgot memory ${input.memoryId}${input.reason ? `: ${input.reason}` : ""}`,
    metadata: { memoryId: input.memoryId, reason: input.reason },
  });

  return { forgotten: result.forgotten };
}
```

- [ ] **Step 6: Add tool to manifest**

In `src/manifest.ts`, add to the `tools` array:

```ts
{
  name: TOOL_KEYS.forget,
  displayName: "Memory Forget",
  description: "Remove a specific memory that is outdated or incorrect.",
  parametersSchema: {
    type: "object",
    required: ["memoryId"],
    properties: {
      memoryId: { type: "string", description: "ID of the memory to remove (from recall/search results)" },
      reason: { type: "string", description: "Why this memory is being removed" },
    },
  },
},
```

- [ ] **Step 7: Register tool handler in worker.ts**

In `src/worker.ts`, import and register:

```ts
import { handleForget } from "./tools/forget.js";

// Inside setup(), after search tool registration:
ctx.tools.register(
  TOOL_KEYS.forget,
  {
    displayName: "Memory Forget",
    description: "Remove a specific memory that is outdated or incorrect.",
    parametersSchema: {
      type: "object",
      required: ["memoryId"],
      properties: {
        memoryId: { type: "string", description: "ID of the memory to remove (from recall/search results)" },
        reason: { type: "string", description: "Why this memory is being removed" },
      },
    },
  },
  async (params, runCtx) => {
    const p = params as Record<string, unknown>;
    const settings = await readCompanySettings(ctx, runCtx.companyId);
    const client = await buildClientWithSecrets(ctx, settings, logger);
    const activity = activityFor(runCtx.companyId);
    const result = await handleForget(client, {
      memoryId: String(p.memoryId ?? ""),
      reason: p.reason ? String(p.reason) : undefined,
    }, activity);
    return { data: result };
  },
);
```

- [ ] **Step 8: Update manifest test**

In `tests/plugin.spec.ts`, update tool count assertion:

```ts
it("declares 4 tools in manifest", () => {
  expect(manifest.tools).toHaveLength(4);
  const toolNames = manifest.tools!.map((t: any) => t.name);
  expect(toolNames).toContain(TOOL_KEYS.recall);
  expect(toolNames).toContain(TOOL_KEYS.observe);
  expect(toolNames).toContain(TOOL_KEYS.search);
  expect(toolNames).toContain(TOOL_KEYS.forget);
});
```

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src/tools/forget.ts tests/forget.spec.ts src/constants.ts src/agentmemory-client.ts src/manifest.ts src/worker.ts tests/agentmemory-client.spec.ts tests/plugin.spec.ts
git commit -m "feat: add memory-forget tool for removing outdated memories"
```

---

### Task 6: Scoped Memory by Project

Auto-fill project from run context and implement tiered search (project-scoped first, then global).

**Files:**
- Create: `tests/scoped.spec.ts`
- Modify: `src/tools/recall.ts`
- Modify: `src/tools/observe.ts`
- Modify: `src/tools/search.ts`
- Modify: `src/worker.ts`

- [ ] **Step 1: Write test for scoped recall**

```ts
// tests/scoped.spec.ts
import { describe, expect, it, vi } from "vitest";
import { handleRecall } from "../src/tools/recall.js";
import { handleObserve } from "../src/tools/observe.js";
import { handleSearch } from "../src/tools/search.js";
import type { AgentmemoryClient } from "../src/agentmemory-client.js";
import type { ActivityLogger } from "../src/tools/recall.js";

function mockClient(overrides: Partial<AgentmemoryClient> = {}): AgentmemoryClient {
  return {
    smartSearch: vi.fn(async () => [
      { content: "scoped result", score: 0.9, source: "s1" },
    ]),
    observe: vi.fn(async () => ({ stored: true, id: "obs-1" })),
    createSketch: vi.fn(async () => ({ id: "sk-1" })),
    ...overrides,
  } as unknown as AgentmemoryClient;
}

function mockActivity(): ActivityLogger {
  return { log: vi.fn(async () => {}) };
}

describe("scoped memory", () => {
  describe("recall", () => {
    it("uses runCtx.projectId when no explicit project", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleRecall(client, { query: "test", maxTokens: 50_000 }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 50, "proj-1");
    });

    it("prefers explicit project over runCtx", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleRecall(client, { query: "test", project: "explicit", maxTokens: 50_000 }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 50, "explicit");
    });
  });

  describe("observe", () => {
    it("auto-tags with runCtx.projectId", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleObserve(client, { observation: "test", category: "discovery" }, activity, { projectId: "proj-1" });

      expect(client.observe).toHaveBeenCalledWith("test", "discovery", "proj-1");
    });
  });

  describe("search", () => {
    it("uses runCtx.projectId when no explicit project", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleSearch(client, { query: "test" }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 10, "proj-1");
    });

    it("searches globally with project '*'", async () => {
      const client = mockClient();
      const activity = mockActivity();
      await handleSearch(client, { query: "test", project: "*" }, activity, { projectId: "proj-1" });

      expect(client.smartSearch).toHaveBeenCalledWith("test", 10, undefined);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scoped.spec.ts`
Expected: FAIL — handlers don't accept 4th argument

- [ ] **Step 3: Add RunScope type and update recall handler**

In `src/tools/recall.ts`, add the scope type and update function signature:

```ts
export type RunScope = {
  projectId?: string;
};

export async function handleRecall(
  client: AgentmemoryClient,
  input: RecallInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
): Promise<RecallOutput> {
  const project = input.project ?? scope.projectId;
  const maxTokens = input.maxTokens ?? 48_200;
  const rawResults = await client.smartSearch(input.query, 50, project);

  // ... rest unchanged, but use `project` variable in activity log ...
  await activity.log({
    message: `Recalled ${items.length} memories (${tokenCount} tokens)${project ? ` for project ${project}` : ""}`,
    metadata: { tokenCount, resultCount: items.length, project },
  });

  return { context, tokenCount, sources };
}
```

- [ ] **Step 4: Update observe handler with scope**

In `src/tools/observe.ts`:

```ts
import type { ActivityLogger, RunScope } from "./recall.js";

export async function handleObserve(
  client: AgentmemoryClient,
  input: ObserveInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
): Promise<ObserveOutput> {
  const project = input.project ?? scope.projectId;
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, project),
    client.createSketch(input.observation, input.category),
  ]);
  // ... activity log uses `project` ...
```

- [ ] **Step 5: Update search handler with scope**

In `src/tools/search.ts`:

```ts
import type { ActivityLogger, RunScope } from "./recall.js";

export async function handleSearch(
  client: AgentmemoryClient,
  input: SearchInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
): Promise<SearchOutput> {
  const limit = input.limit ?? 10;
  const project = input.project === "*" ? undefined : (input.project ?? scope.projectId);
  const rawResults = await client.smartSearch(input.query, limit, project);
  // ... rest unchanged ...
```

- [ ] **Step 6: Wire scope from runCtx in worker.ts**

In each tool handler in `src/worker.ts`, pass scope from `runCtx`:

```ts
const scope = { projectId: runCtx.projectId };
const result = await handleRecall(client, { ... }, activity, scope);
```

Apply same pattern for observe, search, and forget handlers.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/tools/recall.ts src/tools/observe.ts src/tools/search.ts src/worker.ts tests/scoped.spec.ts
git commit -m "feat: auto-scope memory to project from run context"
```

---

### Task 7: Update Skill Markdown

Update the skill to document forget tool, auto-scoping, and all 4 tools.

**Files:**
- Modify: `src/skill.ts`

- [ ] **Step 1: Update SKILL_MARKDOWN**

In `src/skill.ts`, replace `SKILL_MARKDOWN`:

```ts
export const SKILL_MARKDOWN = `# Agent Memory Protocol

You have access to persistent memory tools. Use them to avoid re-doing work and to build institutional knowledge.

## At the start of each task
1. Call \`memory-recall\` with a description of what you're about to do
2. Read the returned context — it contains prior decisions, known patterns, and past failures relevant to your task
3. Do NOT re-investigate what memory already answered

## During work
- Discovered something non-obvious? → \`memory-observe\` with category \`"discovery"\`
- Made an architectural decision? → \`memory-observe\` with category \`"decision"\`
- Something failed unexpectedly? → \`memory-observe\` with category \`"failure"\`
- Identified a recurring pattern? → \`memory-observe\` with category \`"pattern"\`

## When in doubt
- "Have we tried this before?" → \`memory-search\` before investigating from scratch
- "How did we solve X last time?" → \`memory-search\` with relevant context

## Correcting memories
- Recall returned something outdated or wrong? → \`memory-forget\` with the memoryId from the result
- Then observe the correct information with \`memory-observe\`
- Search results and recall results include a \`source\` field — use it as the memoryId for forget

## Project scoping
- Project context is injected automatically from your current run context
- You do NOT need to pass the \`project\` parameter unless targeting a different project
- To search across all projects, pass \`project: "*"\`

## Rules
- Do NOT observe trivial information (imports, boilerplate, obvious code)
- Do NOT observe entire code — observe the decision or insight behind it
- Prefer short, dense observations (1-3 sentences)
- The recall tool already respects token budget — trust the result and use it
- When recall returns relevant context, reference it in your work
`;
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All pass (skill is a string constant, no logic to break)

- [ ] **Step 3: Commit**

```bash
git add src/skill.ts
git commit -m "feat: update skill markdown with forget tool and auto-scoping docs"
```

---

### Task 8: Version Bump to 0.5.0

**Files:**
- Modify: `package.json`
- Modify: `src/manifest.ts`

- [ ] **Step 1: Bump versions**

In `package.json`, change `"version": "0.4.0"` to `"version": "0.5.0"`.
In `src/manifest.ts`, change `version: "0.4.0"` to `version: "0.5.0"`.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add package.json src/manifest.ts
git commit -m "chore: bump version to 0.5.0"
```

---

## Phase 3: Automation (v0.6.0)

### Task 9: New Settings for Automation

Add `enableAutoRecall` and `enableAutoObserve` settings.

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add new fields to settings types and defaults**

In `src/settings.ts`, add to `AgentmemoryMemoryConfig`:

```ts
export type AgentmemoryMemoryConfig = {
  contextWindowSize: number;
  memoryBudgetPercent: number;
  defaultSearchLimit: number;
  curatorIntervalHours: number;
  autoForgetDays: number;
  sketchTTLDays: number;
  enableKnowledgeGraph: boolean;
  enableAutoConsolidate: boolean;
  enableAutoRecall: boolean;
  enableAutoObserve: boolean;
};
```

Add to `MEMORY_CONFIG_DEFAULTS`:

```ts
enableAutoRecall: true,
enableAutoObserve: true,
```

In `normalizeCompanySettings`, add:

```ts
enableAutoRecall: typeof input?.enableAutoRecall === "boolean" ? input.enableAutoRecall : MEMORY_CONFIG_DEFAULTS.enableAutoRecall,
enableAutoObserve: typeof input?.enableAutoObserve === "boolean" ? input.enableAutoObserve : MEMORY_CONFIG_DEFAULTS.enableAutoObserve,
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All pass (new fields have defaults, backward compatible)

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add enableAutoRecall and enableAutoObserve settings"
```

---

### Task 10: Auto-Recall on agent.run.started

Pre-load memory context when an agent run starts.

**Files:**
- Create: `tests/automation.spec.ts`
- Modify: `src/worker.ts`
- Modify: `src/tools/recall.ts`

- [ ] **Step 1: Write test for auto-recall event handler**

```ts
// tests/automation.spec.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_BASE_URL } from "../src/constants.js";

const COMPANY_ID = "co-test-1";

describe("automation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-recalls on agent.run.started and caches in run state", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("smart-search")) {
        return new Response(JSON.stringify({
          results: [{ content: "cached context", score: 0.9, source: "s1" }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("health")) {
        return new Response(JSON.stringify({ status: "healthy" }), { status: 200 });
      }
      // issues.get mock
      return new Response(JSON.stringify({ title: "Fix login bug", description: "Users can't login" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.seed({
      companies: [{ id: COMPANY_ID, name: "Test Co" }],
      issues: [{ id: "issue-1", companyId: COMPANY_ID, title: "Fix login bug", description: "Users can't login" }],
    });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("save-company-settings", {
      companyId: COMPANY_ID,
      settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID, enableAutoRecall: true },
    });

    await harness.emit("agent.run.started", {
      companyId: COMPANY_ID,
      entityId: "run-1",
      entityType: "agent_run",
      payload: { runId: "run-1", agentId: "agent-1", projectId: "proj-1", issueId: "issue-1" },
    });

    // Verify auto-recall was cached in run state
    const cached = harness.getState({
      scopeKind: "run",
      scopeId: "run-1",
      stateKey: "memory.autoRecall",
    });
    expect(cached).toBeDefined();
    expect((cached as any).context).toContain("cached context");
  }, 15000);

  it("skips auto-recall when setting is disabled", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.seed({ companies: [{ id: COMPANY_ID, name: "Test Co" }] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("save-company-settings", {
      companyId: COMPANY_ID,
      settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID, enableAutoRecall: false },
    });

    await harness.emit("agent.run.started", {
      companyId: COMPANY_ID,
      entityId: "run-1",
      entityType: "agent_run",
      payload: { runId: "run-1", agentId: "agent-1" },
    });

    // smart-search should NOT have been called
    const searchCalls = fetchMock.mock.calls.filter(
      (c: any) => typeof c[0] === "string" && c[0].includes("smart-search"),
    );
    expect(searchCalls).toHaveLength(0);
  }, 10000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/automation.spec.ts`
Expected: FAIL — no event handler for agent.run.started

- [ ] **Step 3: Implement auto-recall event handler in worker.ts**

In `src/worker.ts`, inside `setup()`, add after the `issue.updated` handler:

```ts
// --- Auto-recall on agent run start ---
ctx.events.on("agent.run.started", async (event) => {
  const companyId = event.companyId;
  if (!companyId) return;

  const settings = await readCompanySettings(ctx, companyId);
  if (!settings.enableAutoRecall) return;

  const payload = event.payload as Record<string, unknown> | undefined;
  const runId = payload?.runId as string | undefined ?? event.entityId;
  const projectId = payload?.projectId as string | undefined;
  const issueId = payload?.issueId as string | undefined;

  if (!runId) return;

  try {
    // Build recall query from issue context if available
    let query = "general context";
    if (issueId) {
      try {
        const issue = await ctx.issues.get(issueId, companyId);
        if (issue) {
          query = [issue.title, issue.description].filter(Boolean).join(" — ");
        }
      } catch {
        logger.warn("could not fetch issue for auto-recall", { issueId, companyId });
      }
    }

    const client = await buildClientWithSecrets(ctx, settings, logger);
    const budget = calculateBudget(settings.contextWindowSize, settings.memoryBudgetPercent);
    const result = await handleRecall(client, {
      query,
      maxTokens: budget,
    }, activityFor(companyId), { projectId });

    // Cache in run state
    await ctx.state.set({
      scopeKind: "run",
      scopeId: runId,
      stateKey: "memory.autoRecall",
    }, result);

    logger.info("auto-recall completed", { runId, resultCount: result.sources.length, tokenCount: result.tokenCount });
  } catch (err) {
    logger.warn("auto-recall failed", { runId, err });
  }
});
```

- [ ] **Step 4: Update recall tool handler to check cache**

In `src/tools/recall.ts`, add a cache check parameter:

```ts
export type RecallCache = {
  get(runId: string): Promise<RecallOutput | null>;
};

export async function handleRecall(
  client: AgentmemoryClient,
  input: RecallInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
  cache?: RecallCache,
): Promise<RecallOutput> {
  // Check cache first (auto-recall result)
  if (cache && scope.runId) {
    const cached = await cache.get(scope.runId);
    if (cached) {
      await activity.log({
        message: `Returned cached auto-recall (${cached.tokenCount} tokens)`,
        metadata: { tokenCount: cached.tokenCount, cached: true },
      });
      return cached;
    }
  }

  // ... existing logic unchanged ...
```

Update `RunScope` type:

```ts
export type RunScope = {
  projectId?: string;
  runId?: string;
};
```

In `src/worker.ts`, update the recall tool handler to pass cache:

```ts
const recallCache: RecallCache = {
  async get(runId: string) {
    try {
      const cached = await ctx.state.get({
        scopeKind: "run",
        scopeId: runId,
        stateKey: "memory.autoRecall",
      });
      return cached as RecallOutput | null;
    } catch {
      return null;
    }
  },
};

// In recall tool handler:
const scope = { projectId: runCtx.projectId, runId: runCtx.runId };
const result = await handleRecall(client, { ... }, activity, scope, recallCache);
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/worker.ts src/tools/recall.ts tests/automation.spec.ts
git commit -m "feat: auto-recall memory context on agent.run.started"
```

---

### Task 11: Auto-Observe on agent.run.finished

Auto-observe a run summary when an agent run finishes.

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/tools/observe.ts`
- Modify: `tests/automation.spec.ts`

- [ ] **Step 1: Write test for auto-observe**

Add to `tests/automation.spec.ts`:

```ts
it("auto-observes on agent.run.finished when manual observe count < 2", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("observe") || url.includes("sketches")) {
      return new Response(JSON.stringify({ stored: true, id: "auto-obs-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
  harness.seed({
    companies: [{ id: COMPANY_ID, name: "Test Co" }],
    issues: [{ id: "issue-1", companyId: COMPANY_ID, title: "Fix login bug" }],
  });
  await plugin.definition.setup(harness.ctx);

  await harness.performAction("save-company-settings", {
    companyId: COMPANY_ID,
    settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID, enableAutoObserve: true },
  });

  // Simulate run finished
  await harness.emit("agent.run.finished", {
    companyId: COMPANY_ID,
    entityId: "run-1",
    entityType: "agent_run",
    payload: { runId: "run-1", agentId: "agent-1", projectId: "proj-1", issueId: "issue-1", summary: "Fixed the login redirect" },
  });

  // Verify observe was called
  const observeCalls = fetchMock.mock.calls.filter(
    (c: any) => typeof c[0] === "string" && c[0].includes("/observe"),
  );
  expect(observeCalls.length).toBeGreaterThan(0);
}, 15000);

it("skips auto-observe when manual observe count >= 2", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ stored: true, id: "x" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
  harness.seed({ companies: [{ id: COMPANY_ID, name: "Test Co" }] });
  await plugin.definition.setup(harness.ctx);

  await harness.performAction("save-company-settings", {
    companyId: COMPANY_ID,
    settings: { baseUrl: DEFAULT_BASE_URL, memoryNamespace: COMPANY_ID, enableAutoObserve: true },
  });

  // Simulate agent already observed 2 times during the run
  await ctx_state_set_helper(harness, "run-2", "memory.observeCount", 2);

  await harness.emit("agent.run.finished", {
    companyId: COMPANY_ID,
    entityId: "run-2",
    entityType: "agent_run",
    payload: { runId: "run-2", agentId: "agent-1" },
  });

  // Observe should NOT have been called for auto-observe
  const observeCalls = fetchMock.mock.calls.filter(
    (c: any) => typeof c[0] === "string" && c[0].includes("/observe"),
  );
  expect(observeCalls).toHaveLength(0);
}, 10000);

// Helper to set state in harness
async function ctx_state_set_helper(harness: any, runId: string, key: string, value: unknown) {
  // Use harness.ctx.state directly
  await harness.ctx.state.set({ scopeKind: "run", scopeId: runId, stateKey: key }, value);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/automation.spec.ts`
Expected: FAIL — no handler for agent.run.finished

- [ ] **Step 3: Track manual observe count in observe tool handler**

In `src/tools/observe.ts`, add state tracking parameter:

```ts
export type ObserveStateTracker = {
  incrementObserveCount(runId: string): Promise<void>;
};

export async function handleObserve(
  client: AgentmemoryClient,
  input: ObserveInput,
  activity: ActivityLogger = noopActivity,
  scope: RunScope = {},
  stateTracker?: ObserveStateTracker,
): Promise<ObserveOutput> {
  const project = input.project ?? scope.projectId;
  const [obsResult] = await Promise.all([
    client.observe(input.observation, input.category, project),
    client.createSketch(input.observation, input.category),
  ]);

  // Track manual observe count for deduplication with auto-observe
  if (stateTracker && scope.runId) {
    await stateTracker.incrementObserveCount(scope.runId).catch(() => {});
  }

  // ... activity log unchanged ...
  return { stored: obsResult.stored, id: obsResult.id };
}
```

In `src/worker.ts`, create state tracker and pass to observe handler:

```ts
const observeTracker: ObserveStateTracker = {
  async incrementObserveCount(runId: string) {
    const key = { scopeKind: "run" as const, scopeId: runId, stateKey: "memory.observeCount" };
    const current = (await ctx.state.get(key).catch(() => 0)) as number;
    await ctx.state.set(key, (current || 0) + 1);
  },
};

// In observe tool handler, add stateTracker:
const scope = { projectId: runCtx.projectId, runId: runCtx.runId };
const result = await handleObserve(client, { ... }, activity, scope, observeTracker);
```

- [ ] **Step 4: Implement auto-observe event handler**

In `src/worker.ts`, inside `setup()`:

```ts
// --- Auto-observe on agent run finish ---
ctx.events.on("agent.run.finished", async (event) => {
  const companyId = event.companyId;
  if (!companyId) return;

  const settings = await readCompanySettings(ctx, companyId);
  if (!settings.enableAutoObserve) return;

  const payload = event.payload as Record<string, unknown> | undefined;
  const runId = payload?.runId as string | undefined ?? event.entityId;
  const projectId = payload?.projectId as string | undefined;
  const issueId = payload?.issueId as string | undefined;

  if (!runId) return;

  try {
    // Check manual observe count — skip if agent already actively observed
    const observeCount = await ctx.state.get({
      scopeKind: "run",
      scopeId: runId,
      stateKey: "memory.observeCount",
    }).catch(() => 0) as number;

    if ((observeCount || 0) >= 2) {
      logger.info("skipping auto-observe, agent already observed during run", { runId, observeCount });
      return;
    }

    // Build summary from payload or issue
    let summary = payload?.summary as string | undefined;
    if (!summary && issueId) {
      try {
        const issue = await ctx.issues.get(issueId, companyId);
        if (issue) {
          summary = `Completed work on: ${issue.title}`;
        }
      } catch {
        logger.warn("could not fetch issue for auto-observe", { issueId });
      }
    }

    if (!summary) {
      summary = `Agent run ${runId} completed`;
    }

    const client = await buildClientWithSecrets(ctx, settings, logger);
    await handleObserve(client, {
      observation: summary,
      category: "discovery",
    }, activityFor(companyId), { projectId, runId });

    logger.info("auto-observe completed", { runId });
  } catch (err) {
    logger.warn("auto-observe failed", { runId, err });
  }
});
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/worker.ts src/tools/observe.ts tests/automation.spec.ts
git commit -m "feat: auto-observe run summary on agent.run.finished"
```

---

### Task 12: Update Skill for Hybrid Mode

Tell agents what's automatic vs. manual.

**Files:**
- Modify: `src/skill.ts`

- [ ] **Step 1: Update SKILL_MARKDOWN for hybrid mode**

In `src/skill.ts`, replace `SKILL_MARKDOWN`:

```ts
export const SKILL_MARKDOWN = `# Agent Memory Protocol

You have access to persistent memory tools. Memory context is managed both automatically and manually.

## Automatic behavior (no action needed)
- **Auto-recall:** Memory context is loaded automatically at the start of each run. You receive prior decisions, known patterns, and past failures relevant to your current task.
- **Auto-observe:** A summary of your work is recorded automatically at the end of each run.

## When to use tools manually

### memory-recall
Use \`memory-recall\` only when you need context NOT covered by the auto-loaded memory:
- Searching for something specific from a different project
- Narrowing down to a particular topic mid-task

### memory-observe
Use \`memory-observe\` during work for **high-value insights only**:
- Made an architectural decision? → category \`"decision"\`
- Something failed unexpectedly? → category \`"failure"\`
- Discovered something non-obvious? → category \`"discovery"\`
- Identified a recurring pattern? → category \`"pattern"\`

Basic run summaries are captured automatically — only observe what the auto-summary would miss.

### memory-search
- "Have we tried this before?" → \`memory-search\` before investigating from scratch
- "How did we solve X last time?" → \`memory-search\` with relevant context

### memory-forget
- Recall returned something outdated or wrong? → \`memory-forget\` with the memoryId from the result
- Then observe the correct information with \`memory-observe\`
- Search results and recall results include a \`source\` field — use it as the memoryId for forget

## Project scoping
- Project context is injected automatically from your current run context
- You do NOT need to pass the \`project\` parameter unless targeting a different project
- To search across all projects, pass \`project: "*"\`

## Rules
- Do NOT observe trivial information (imports, boilerplate, obvious code)
- Do NOT observe entire code — observe the decision or insight behind it
- Prefer short, dense observations (1-3 sentences)
- The recall tool already respects token budget — trust the result and use it
- When recall returns relevant context, reference it in your work
`;
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/skill.ts
git commit -m "feat: update skill to hybrid mode (auto + manual)"
```

---

## Phase 4: Ecosystem (v0.6.0)

### Task 13: Cross-Plugin Events

Emit events that other plugins can subscribe to.

**Files:**
- Create: `src/events.ts`
- Create: `tests/events.spec.ts`
- Modify: `src/constants.ts`
- Modify: `src/manifest.ts`
- Modify: `src/worker.ts`

- [ ] **Step 1: Write test for event emitter helper**

```ts
// tests/events.spec.ts
import { describe, expect, it, vi } from "vitest";
import { createMemoryEventEmitter, type MemoryEventEmitter } from "../src/events.js";

describe("MemoryEventEmitter", () => {
  it("emits memory.recalled with payload", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.recalled("co-1", { tokenCount: 500, resultsCount: 3, project: "proj-1" });

    expect(emit).toHaveBeenCalledWith("memory.recalled", "co-1", {
      tokenCount: 500, resultsCount: 3, project: "proj-1",
    });
  });

  it("emits memory.recall.empty when resultsCount is 0", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.recalled("co-1", { tokenCount: 0, resultsCount: 0, project: "proj-1" });

    expect(emit).toHaveBeenCalledWith("memory.recall.empty", "co-1", {
      query: undefined, project: "proj-1",
    });
  });

  it("emits memory.observed with category", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.observed("co-1", { category: "failure", project: "proj-1", memoryId: "obs-1" });
    expect(emit).toHaveBeenCalledWith("memory.observed", "co-1", {
      category: "failure", project: "proj-1", memoryId: "obs-1",
    });
  });

  it("emits memory.forgotten", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.forgotten("co-1", { memoryId: "obs-1", reason: "outdated" });
    expect(emit).toHaveBeenCalledWith("memory.forgotten", "co-1", {
      memoryId: "obs-1", reason: "outdated",
    });
  });

  it("emits memory.consolidated", async () => {
    const emit = vi.fn(async () => {});
    const emitter = createMemoryEventEmitter(emit);

    await emitter.consolidated("co-1", { consolidated: 5, compressed: 2, forgotten: 1, discarded: 3 });
    expect(emit).toHaveBeenCalledWith("memory.consolidated", "co-1", {
      consolidated: 5, compressed: 2, forgotten: 1, discarded: 3,
    });
  });

  it("does not throw if emit fails", async () => {
    const emit = vi.fn(async () => { throw new Error("emit failed"); });
    const emitter = createMemoryEventEmitter(emit);

    await expect(emitter.recalled("co-1", { tokenCount: 0, resultsCount: 0 })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/events.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement events module**

```ts
// src/events.ts
export interface MemoryEventEmitter {
  recalled(companyId: string, payload: { tokenCount: number; resultsCount: number; project?: string; query?: string }): Promise<void>;
  observed(companyId: string, payload: { category: string; project?: string; memoryId: string }): Promise<void>;
  forgotten(companyId: string, payload: { memoryId: string; reason?: string }): Promise<void>;
  consolidated(companyId: string, payload: { consolidated: number; compressed: number; forgotten: number; discarded: number }): Promise<void>;
}

type EmitFn = (name: string, companyId: string, payload: unknown) => Promise<void>;

export function createMemoryEventEmitter(emit: EmitFn): MemoryEventEmitter {
  const safe = async (name: string, companyId: string, payload: unknown) => {
    try { await emit(name, companyId, payload); } catch { /* fire-and-forget */ }
  };

  return {
    async recalled(companyId, payload) {
      await safe("memory.recalled", companyId, payload);
      if (payload.resultsCount === 0) {
        await safe("memory.recall.empty", companyId, { query: payload.query, project: payload.project });
      }
    },
    async observed(companyId, payload) {
      await safe("memory.observed", companyId, payload);
    },
    async forgotten(companyId, payload) {
      await safe("memory.forgotten", companyId, payload);
    },
    async consolidated(companyId, payload) {
      await safe("memory.consolidated", companyId, payload);
    },
  };
}

export const noopEmitter: MemoryEventEmitter = {
  async recalled() {},
  async observed() {},
  async forgotten() {},
  async consolidated() {},
};
```

- [ ] **Step 4: Add events.emit capability to manifest**

In `src/manifest.ts`, add to `capabilities`:

```ts
"events.emit",
```

- [ ] **Step 5: Wire event emitter in worker.ts**

In `src/worker.ts`, create emitter in `setup()` and pass to handlers:

```ts
import { createMemoryEventEmitter, type MemoryEventEmitter } from "./events.js";

// Inside setup():
const emitter = createMemoryEventEmitter(ctx.events.emit.bind(ctx.events));
```

Then pass `emitter` and `companyId` to each tool handler. Update tool handler signatures to accept an optional emitter parameter and call it after the operation succeeds. Example for recall tool handler in worker:

```ts
// After handleRecall returns:
await emitter.recalled(runCtx.companyId, {
  tokenCount: result.tokenCount,
  resultsCount: result.sources.length,
  project: scope.projectId,
  query: String(p.query ?? ""),
});
```

Same pattern for observe (emit `observed`), forget (emit `forgotten`), and curator job (emit `consolidated`).

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/events.ts tests/events.spec.ts src/constants.ts src/manifest.ts src/worker.ts
git commit -m "feat: emit cross-plugin events for all memory operations"
```

---

### Task 14: Memory Reflection Skill

New skill for retrospective analysis at milestone/project completion.

**Files:**
- Create: `src/reflection.ts`
- Modify: `src/constants.ts`
- Modify: `src/manifest.ts`
- Modify: `src/worker.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Add constants**

In `src/constants.ts`, add:

```ts
export const REFLECTION_SKILL_KEY = "memory-reflection";
```

- [ ] **Step 2: Create reflection module**

```ts
// src/reflection.ts
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { REFLECTION_SKILL_KEY } from "./constants.js";

export const REFLECTION_DISPLAY_NAME = "Memory Reflection";
export const REFLECTION_DESCRIPTION =
  "Guides agents through retrospective analysis of decisions and failures at milestone completion.";

export const REFLECTION_MARKDOWN = `# Memory Reflection Protocol

Run this retrospective when a milestone, sprint, or major feature is completed.

## Steps

1. **Gather failures:**
   Call \`memory-search\` with a query targeting failures in this project.
   Review each failure — what went wrong and what was the root cause?

2. **Gather decisions:**
   Call \`memory-search\` with a query targeting decisions in this project.
   List the key architectural and design decisions made.

3. **Cross-reference:**
   Which decisions contributed to failures?
   Which decisions prevented failures or worked well?
   Are there recurring failure patterns across multiple tasks?

4. **Synthesize:**
   Write a consolidated insight as a \`memory-observe\` with category \`"pattern"\`.
   Focus on actionable takeaways, not a narrative.
   Example: "Pattern: skipping integration tests before DB migrations led to 3 production rollbacks. Always run migration tests against a staging copy first."

5. **Report:**
   Present the reflection summary to the user with:
   - Total failures reviewed
   - Total decisions reviewed
   - Key patterns identified
   - Recommended changes

## Rules
- Be ruthlessly specific — "improve testing" is not a pattern, "add integration tests for migration scripts" is
- One observation per pattern — don't dump everything into one
- If no meaningful patterns emerge, say so — don't fabricate insights
`;

export async function reconcileReflection(ctx: PluginContext, companyId: string): Promise<void> {
  await ctx.skills.managed.reconcile(REFLECTION_SKILL_KEY, companyId);
}
```

- [ ] **Step 3: Add reflection skill to manifest**

In `src/manifest.ts`, import and add to `skills` array:

```ts
import {
  REFLECTION_DISPLAY_NAME,
  REFLECTION_DESCRIPTION,
  REFLECTION_MARKDOWN,
} from "./reflection.js";
import { REFLECTION_SKILL_KEY } from "./constants.js";

// In skills array:
{
  skillKey: REFLECTION_SKILL_KEY,
  displayName: REFLECTION_DISPLAY_NAME,
  description: REFLECTION_DESCRIPTION,
  markdown: REFLECTION_MARKDOWN,
},
```

- [ ] **Step 4: Add enableAutoReflection setting**

In `src/settings.ts`, add to `AgentmemoryMemoryConfig`:

```ts
enableAutoReflection: boolean;
```

Add to `MEMORY_CONFIG_DEFAULTS`:

```ts
enableAutoReflection: false,
```

Add to `normalizeCompanySettings`:

```ts
enableAutoReflection: typeof input?.enableAutoReflection === "boolean" ? input.enableAutoReflection : MEMORY_CONFIG_DEFAULTS.enableAutoReflection,
```

- [ ] **Step 5: Wire reflection reconcile and optional project.updated trigger**

In `src/worker.ts`, import and reconcile:

```ts
import { reconcileReflection } from "./reflection.js";

// In setup(), alongside existing reconcile loops:
for (const company of companies) {
  await reconcileSkill(ctx, company.id);
  await reconcileCurator(ctx, company.id);
  await reconcileReflection(ctx, company.id);
}

// In company.created handler:
ctx.events.on("company.created", async (event) => {
  await reconcileSkill(ctx, event.companyId);
  await reconcileCurator(ctx, event.companyId);
  await reconcileReflection(ctx, event.companyId);
});
```

- [ ] **Step 6: Update manifest test**

In `tests/plugin.spec.ts`:

```ts
it("declares 2 managed skills", () => {
  expect(manifest.skills).toHaveLength(2);
  const keys = (manifest.skills as any[]).map((s: any) => s.skillKey);
  expect(keys).toContain("agent-memory");
  expect(keys).toContain("memory-reflection");
});
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/reflection.ts src/constants.ts src/manifest.ts src/worker.ts src/settings.ts tests/plugin.spec.ts
git commit -m "feat: add Memory Reflection skill for retrospective analysis"
```

---

### Task 15: Real-Time Dashboard Streams

Push SSE events to UI widgets for real-time updates.

**Files:**
- Modify: `src/worker.ts`

- [ ] **Step 1: Add stream emissions after key operations**

In `src/worker.ts`, after the emitter is created, add stream push calls at the same points where events are emitted. After observe, recall, forget, and curator operations:

```ts
// Helper to push stats update to stream
async function pushStatsStream(companyId: string) {
  try {
    const settings = await readCompanySettings(ctx, companyId);
    const client = await buildClientWithSecrets(ctx, settings, logger);
    const [memoriesCount, graphStats] = await Promise.all([
      client.memoriesCount().catch(() => 0),
      client.graphStats().catch(() => ({ nodes: 0, edges: 0 })),
    ]);
    ctx.streams.emit(`memory.stats.${companyId}`, {
      memoriesCount,
      graphNodes: graphStats.nodes,
      graphEdges: graphStats.edges,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("failed to push stats stream", { companyId, err });
  }
}
```

Add stream push after observe tool handler returns:

```ts
// After handleObserve returns in the tool handler:
pushStatsStream(runCtx.companyId).catch(() => {});
```

Add stream push after curator job completes for each company:

```ts
// After runCuratorJob returns in the job handler:
pushStatsStream(company.id).catch(() => {});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (streams are fire-and-forget, no test assertions needed for streams)

- [ ] **Step 3: Commit**

```bash
git add src/worker.ts
git commit -m "feat: push real-time stats to dashboard via streams"
```

---

### Task 16: Version Bump to 0.6.0 and Final Validation

**Files:**
- Modify: `package.json`
- Modify: `src/manifest.ts`

- [ ] **Step 1: Bump versions**

In `package.json`, change `"version": "0.5.0"` to `"version": "0.6.0"`.
In `src/manifest.ts`, change `version: "0.5.0"` to `version: "0.6.0"`.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add package.json src/manifest.ts
git commit -m "chore: bump version to 0.6.0"
```

---

## Task Summary

| Task | Phase | Description | Files |
|------|-------|-------------|-------|
| 1 | 1 | Logger type & injection | 8 files |
| 2 | 1 | Activity logging in tool handlers | 5 files |
| 3 | 1 | Curator scheduled job | 5 files |
| 4 | 1 | Secrets resolution for bearer token | 4 files |
| 5 | 2 | memory-forget tool | 7 files |
| 6 | 2 | Scoped memory by project | 5 files |
| 7 | 2 | Update skill markdown | 1 file |
| 8 | 2 | Version bump to 0.5.0 | 2 files |
| 9 | 3 | New settings for automation | 1 file |
| 10 | 3 | Auto-recall on agent.run.started | 3 files |
| 11 | 3 | Auto-observe on agent.run.finished | 3 files |
| 12 | 3 | Update skill for hybrid mode | 1 file |
| 13 | 4 | Cross-plugin events | 5 files |
| 14 | 4 | Memory Reflection skill | 5 files |
| 15 | 4 | Real-time dashboard streams | 1 file |
| 16 | 4 | Version bump to 0.6.0 + final validation | 2 files |
