

# Fix: Opening Line Being Overwritten After Save + Double Agent Name

## Root Cause

Two issues are causing the opening line problems:

### Issue 1: Opening line gets overwritten by auto-applied critical fixes
When a call is evaluated (`evaluate-call`), the AI may flag the opening line as needing a "critical" fix. The `PROTECTED_FIELDS` check only blocks the overwrite if there's a recent `[VERBAL-TRAINING]` or `[MANUAL]` tagged improvement — but **normal user edits via the Edit page don't create improvement records**. So the user saves their opening line, a test/simulation call runs, the evaluator generates a "better" opening line, and auto-applies it as a critical fix — overwriting what the user just set.

### Issue 2: Double `{{agent_name}}` in AI-generated opening lines
The AI (via `generate-spec` or `evaluate-call`) sometimes produces opening lines like `"Hi, this is {{agent_name}} and I am {{agent_name}}"` because it's trying to fill in a name while also using the placeholder. The `guardOpeningLine` function only catches the **first** pattern match and only replaces hardcoded names that **don't match** the persona — it doesn't detect or fix duplicate `{{agent_name}}` placeholders.

## Fixes

### Fix 1: Block auto-apply of `opening_line` entirely
In `supabase/functions/evaluate-call/index.ts`, add `opening_line` to a **hard-block list** that prevents auto-application regardless of manual edit history. The opening line is a user-controlled creative element that should never be auto-overwritten. Users can still see the recommendation and choose "Apply Fix" manually.

### Fix 2: Add duplicate placeholder detection to `guardOpeningLine`
In `src/lib/openingLineGuard.ts`, add a post-processing step that detects and removes duplicate `{{agent_name}}` occurrences, keeping only the first one and cleaning up the resulting text.

### Fix 3: Record user edits as `[MANUAL]` improvements
In `src/pages/EditAgentPage.tsx`, when saving and the opening line has changed from its original value, insert an improvement record tagged `[MANUAL]` so the protection system recognizes it. This provides defense-in-depth for all protected fields.

| File | Change |
|------|--------|
| `supabase/functions/evaluate-call/index.ts` | Hard-block `opening_line` from auto-critical application |
| `src/lib/openingLineGuard.ts` | Add duplicate `{{agent_name}}` detection and cleanup |
| `src/pages/EditAgentPage.tsx` | Record `[MANUAL]` improvement when opening line changes |

