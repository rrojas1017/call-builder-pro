

# Two Issues: Business Rules Ignored + UI Limit on Rules

## Issue 1: Agent ignores FPL business rules, insists on zipcode

**Root Cause**: The prompt has a conflict. The user's business rule (a detailed FPL qualification workflow) is injected as a `BUSINESS RULES` block, but lower in the prompt the hardcoded `buildCompactFplSep()` injects its *own* simplified FPL rules that contradict/override the user's nuanced version. Additionally, the `COLLECT (in order)` section likely includes a zip code field with aggressive ZIP validation instructions ("Must be exactly 5 digits... repeat it back...") that the agent prioritizes over the business rules.

The prompt ordering puts `BUSINESS RULES` before the `COLLECT` and `FPL QUALIFICATION` sections. Since LLMs tend to weight later instructions more heavily, the hardcoded FPL rules and ZIP validation override the user's custom business rules.

**Fix — both `buildTaskPrompt.ts` files (client + server)**:
1. **Skip hardcoded FPL/SEP injection if business rules already cover FPL**: Check if any business rule mentions "FPL" or "federal poverty" — if so, skip the `buildCompactFplSep()` injection to avoid conflicting instructions.
2. **Move BUSINESS RULES block to the end of the prompt** (just before FALLBACK/SUMMARY), so they get highest priority as "last instruction wins" with LLMs.
3. **Add explicit priority note**: Append to the business rules section: "When business rules conflict with any other instruction in this prompt, ALWAYS follow the business rules."

## Issue 2: No limit on business rules count, but UI needs scroll

**Finding**: There is no code-level limit on the number of business rules — `businessRules` is an unbounded `string[]`. However, when many long rules are added (like the one in the screenshot), the rules list grows vertically without bound, pushing the rest of the form off-screen.

**Fix — `EditAgentPage.tsx`**:
1. Wrap the business rules list in a `ScrollArea` with `max-h-[400px]` so it becomes scrollable after ~5-6 rules.
2. Use `Textarea` instead of `Input` for the "Add rule" field so users can enter multi-line rules more comfortably.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/buildTaskPrompt.ts` | Move business rules to end of prompt; skip hardcoded FPL if business rules cover it; add priority override note |
| `src/lib/buildTaskPrompt.ts` | Same changes (client-side copy) |
| `src/pages/EditAgentPage.tsx` | Add ScrollArea around business rules list; switch input to Textarea |

