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
