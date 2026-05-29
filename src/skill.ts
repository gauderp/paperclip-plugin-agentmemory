import type { PluginContext } from "@paperclipai/plugin-sdk";
import { SKILL_KEY } from "./constants.js";

export const SKILL_DISPLAY_NAME = "Agent Memory";
export const SKILL_DESCRIPTION =
  "Teaches agents to use persistent memory — recall context, observe decisions, search history.";

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

export async function reconcileSkill(ctx: PluginContext, companyId: string): Promise<void> {
  await ctx.skills.managed.reconcile(SKILL_KEY, companyId);
}

export async function reconcileSkillAllCompanies(ctx: PluginContext): Promise<void> {
  const companies = await ctx.companies.list();
  for (const company of companies) {
    await reconcileSkill(ctx, company.id);
  }
}
