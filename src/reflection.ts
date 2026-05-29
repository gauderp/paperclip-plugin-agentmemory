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
