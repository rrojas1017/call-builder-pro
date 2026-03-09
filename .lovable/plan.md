

# Why Your Verbal Feedback Isn't Taking Effect

## The Problem (Two Issues)

**Issue 1: Field order is wrong.** Your feedback "ask about their field/vertical first" was captured correctly — it's stored in `business_rules` and was added to `must_collect_fields`. But the merge logic **appended** it to the END of the list instead of moving it to position 1. The current order is:

1. "What is their biggest frustration with outreach?" ← still first
2. "Which Appendify feature resonated most?"
3. "Are they interested in a hands-on trial?"
4. "What kind of work do you do..." ← your feedback, stuck at #4
5. "Ask about business/industry before diving into features" ← duplicate, also at end

Since the prompt builder says "COLLECT (in order)", the agent asks about frustrations before even knowing what the person does.

**Issue 2: Opening line was overwritten.** You set the witty "full disclosure — I'm an AI" opener, but the auto-critical system overwrote it with a generic compliance-focused line: "Hey there! This is Dex, an AI assistant from Appendify. Just so you know, this call is being recorded..."

## Fix Plan

### 1. Fix the data immediately (database update)
- Reorder `must_collect_fields` so "What field/vertical are you in?" is FIRST
- Remove the duplicate "Ask about business/industry" instruction (it's redundant with the reordered field)
- Restore the opening line to the witty version you approved

### 2. Fix the `apply-improvement` edge function
- When an improvement specifies a **reorder** for an array field (like `must_collect_fields`), **replace** the array instead of merging/appending. The current `mergeArrays` function always appends new items to the end, which defeats the purpose of reordering.
- Add a `replace_mode` flag that the evaluate-call function can set when the improvement is about field ordering rather than adding new items.

### 3. Protect manually-set opening lines from auto-critical overwrites
- In `evaluate-call`, before auto-applying critical fixes to `opening_line`, check if the opening line was recently set manually (via direct database update or verbal training). If so, skip the auto-critical override or flag it for review instead of auto-applying.

### Files Changed
- **Database migration** — fix `must_collect_fields` order and restore opening line for this agent
- **`supabase/functions/apply-improvement/index.ts`** — support replace mode for array fields
- **`supabase/functions/evaluate-call/index.ts`** — pass replace mode for reorder improvements; protect manually-set opening lines

