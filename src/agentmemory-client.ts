import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  SMART_SEARCH_PATH,
  OBSERVE_PATH,
  SKETCHES_PATH,
  CONSOLIDATE_PATH,
  CRYSTALS_AUTO_PATH,
  FLOW_COMPRESS_PATH,
  AUTO_FORGET_PATH,
  SKETCHES_GC_PATH,
  GRAPH_EXTRACT_PATH,
  GRAPH_STATS_PATH,
  MEMORIES_PATH,
} from "./constants.js";

type HttpLike = Pick<PluginContext["http"], "fetch">;

export class AgentmemoryClient {
  constructor(
    private http: HttpLike,
    private baseUrl: string,
    private namespace: string,
    private bearerToken?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.bearerToken) {
      h.Authorization = `Bearer ${this.bearerToken}`;
    }
    return h;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.http.fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`agentmemory responded ${response.status} at ${path}`);
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
      throw new Error(`agentmemory responded ${response.status} at ${path}`);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async smartSearch(
    query: string,
    limit: number,
    project?: string,
  ): Promise<Array<{ content: string; score: number; source?: string }>> {
    const body: Record<string, unknown> = { query, limit, namespace: this.namespace };
    if (project) body.project = project;
    const result = await this.post<{ results: Array<{ content: string; score: number; source?: string }> }>(
      SMART_SEARCH_PATH,
      body,
    );
    return result.results ?? [];
  }

  async observe(
    observation: string,
    category: string,
    project?: string,
  ): Promise<{ stored: boolean; id: string }> {
    const body: Record<string, unknown> = {
      hookType: "observation",
      data: { observation, category },
      namespace: this.namespace,
      timestamp: new Date().toISOString(),
    };
    if (project) body.project = project;
    return this.post(OBSERVE_PATH, body);
  }

  async createSketch(content: string, category: string): Promise<{ id: string }> {
    return this.post(SKETCHES_PATH, {
      content,
      category,
      namespace: this.namespace,
    });
  }

  async consolidate(project?: string): Promise<{ consolidated: number }> {
    const body: Record<string, unknown> = { namespace: this.namespace };
    if (project) body.project = project;
    return this.post(CONSOLIDATE_PATH, body);
  }

  async autoCrystallize(): Promise<{ created: number }> {
    return this.post(CRYSTALS_AUTO_PATH, { namespace: this.namespace });
  }

  async flowCompress(project?: string): Promise<{ compressed: number }> {
    const body: Record<string, unknown> = { namespace: this.namespace };
    if (project) body.project = project;
    return this.post(FLOW_COMPRESS_PATH, body);
  }

  async autoForget(olderThanDays: number): Promise<{ forgotten: number }> {
    return this.post(AUTO_FORGET_PATH, {
      namespace: this.namespace,
      olderThanDays,
    });
  }

  async sketchesGc(olderThanDays: number): Promise<{ discarded: number }> {
    return this.post(SKETCHES_GC_PATH, {
      namespace: this.namespace,
      olderThanDays,
    });
  }

  async graphExtract(project?: string): Promise<{ extracted: number }> {
    const body: Record<string, unknown> = { namespace: this.namespace };
    if (project) body.project = project;
    return this.post(GRAPH_EXTRACT_PATH, body);
  }

  async graphStats(): Promise<{ nodes: number; edges: number }> {
    return this.get(GRAPH_STATS_PATH);
  }

  async memoriesCount(): Promise<number> {
    const result = await this.get<{ count?: number; memories?: unknown[] }>(MEMORIES_PATH);
    return result.count ?? result.memories?.length ?? 0;
  }
}
