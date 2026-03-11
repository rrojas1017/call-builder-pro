

# Root Cause Analysis: Business Rules Deleted, Repeat Mistakes, Unwanted Fields

## What's Happening

Three interconnected issues traced to the same root causes in the evaluation and auto-apply pipeline:

### Issue 1: Business rules get deleted after training
**Root cause**: The `evaluate-call` AI recommends changes to `business_rules` as a complete replacement object. When `apply-improvement` receives this, `business_rules` is in `JSON_FIELDS` but NOT in `ARRAY_FIELDS`. So at line 201 of `apply-improvement`, it does `patch[field] = parsedValue` — a full **replace**, not a merge. The existing business rules are overwritten entirely.

### Issue 2: Agent repeats mistakes after coaching (e.g., saying name twice)
**Root cause**: The coaching feedback goes through `apply-audit-recommendation` which patches `humanization_notes` or `tone_style`. But the evaluate-call AI doesn't see prior coaching feedback in its prompt context — it only sees recent `improvements` table entries. When the next evaluation runs, it may suggest contradictory changes because it doesn't know about the coaching intent. Also, `humanization_notes` is applied with `replace_mode: true` (line 706), so each evaluation **replaces** all humanness notes instead of merging with coached ones.

### Issue 3: AI adds unwanted must_collect_fields (zip code, etc.)
**Root cause**: The `evaluate-call` prompt (line 170) tells the AI: `For "must_collect_fields": suggested_value MUST be a JSON array of question strings`. The AI sees the agent's use case (e.g., ACA pre-qualification) and, based on its training data, suggests collecting zip code, state, etc. — even though the creator never configured those. When the fix has `severity: "critical"` and `isReorder` is detected (line 821-823), it's applied with `replace_mode: true`, completely replacing the creator's intended fields. Even without reorder, the `mergeArrays` function adds the unwanted fields.

## Fix Plan

### Change 1: Add `business_rules` and `must_collect_fields` to PROTECTED_FIELDS
In `evaluate-call/index.ts`, expand the `PROTECTED_FIELDS` array to include fields that should never be auto-modified without human approval:

```
const PROTECTED_FIELDS = ["opening_line", "business_rules", "must_collect_fields"];
```

This prevents auto-critical fixes from overwriting these creator-controlled fields.

### Change 2: Add explicit constraint to evaluate-call AI prompt
Add to the system prompt in `evaluate-call/index.ts`:

- "Do NOT suggest adding fields to `must_collect_fields` that are not already present in the spec. Only suggest reordering or rewording existing fields."
- "Do NOT suggest replacing or removing `business_rules`. Only suggest additions."
- "When suggesting `humanization_notes`, provide ONLY the NEW notes to ADD, not a full replacement."

### Change 3: Fix business_rules handling in apply-improvement
`business_rules` is stored as JSONB (can be `{rules: [...]}` object or a string). When the AI suggests a change, the current code replaces the entire object. Fix: for `business_rules`, deep-merge the `rules` array instead of replacing. Add `business_rules` handling that merges rule arrays similar to how `ARRAY_FIELDS` work.

### Change 4: Stop replace_mode for humanization_notes from evaluate-call
In `evaluate-call/index.ts` around line 700-706, change the humanness auto-apply from `replace_mode: true` to `replace_mode: false` (merge mode). This preserves coaching-applied notes while adding new suggestions.

### Change 5: Add coaching context to evaluate-call prompt
Before building the evaluation prompt, fetch recent `spec_change_log` entries with `source = 'user_feedback'` and include them as "COACHING DIRECTIVES" in the system prompt. This tells the evaluator AI what the creator explicitly trained, so it doesn't contradict it.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/evaluate-call/index.ts` | Expand PROTECTED_FIELDS; add prompt constraints for must_collect_fields/business_rules; change humanness replace_mode to false; add coaching context block |
| `supabase/functions/apply-improvement/index.ts` | Add business_rules deep-merge logic for rules arrays |

