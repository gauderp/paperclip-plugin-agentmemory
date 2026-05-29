import type { PluginContext } from "@paperclipai/plugin-sdk";
import { SKILL_KEY } from "./constants.js";

export const SKILL_DISPLAY_NAME = "Agent Memory";
export const SKILL_DESCRIPTION =
  "Teaches agents to use persistent memory — recall context, observe decisions, search history.";

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

export async function reconcileSkill(ctx: PluginContext, companyId: string): Promise<void> {
  await ctx.skills.managed.reconcile(SKILL_KEY, companyId);
}

export async function reconcileSkillAllCompanies(ctx: PluginContext): Promise<void> {
  const companies = await ctx.companies.list();
  for (const company of companies) {
    await reconcileSkill(ctx, company.id);
  }
}
