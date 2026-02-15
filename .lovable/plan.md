

## Fix: Prevent "Apply Fix" from Corrupting Array Fields

### Problem

When the evaluator suggests improvements for array fields like `must_collect_fields` and `humanization_notes`, it generates prose paragraphs as the `suggested_value`. The `apply-improvement` function stores these as raw strings. Then `buildTaskPrompt` expects arrays, fails to parse them, and silently drops all field collection instructions and humanization notes from the prompt.

This is why fixes appear "applied" in the UI but the agent keeps making the same mistakes -- the instructions never actually reach the call.

### Root Causes

1. **`apply-improvement`** does not validate that JSON_FIELDS actually contain valid structured data after parsing
2. **The evaluator prompt** does not instruct the AI to return properly structured values for array fields
3. **No schema enforcement** on `suggested_value` format per field type

### Solution (3 changes)

#### 1. `supabase/functions/apply-improvement/index.ts` -- Add array validation for JSON_FIELDS

After the JSON_FIELDS parsing block (line ~102-109), add validation:
- If the field is known to be an array type (`must_collect_fields`, `humanization_notes`, `research_sources`), verify the parsed value is actually an array
- If it's a string, attempt to split it into meaningful array items (by newlines or sentences)
- If it's a prose paragraph that can't be structured, wrap it as a single-element array rather than storing it as a raw string
- Log a warning when coercion happens so we can track it

#### 2. `supabase/functions/evaluate-call/index.ts` -- Constrain suggested_value format in evaluator prompt

Add explicit instructions to the evaluator's system prompt telling it:
- For `must_collect_fields`: suggested_value MUST be a JSON array of question strings
- For `humanization_notes`: suggested_value MUST be a JSON array of technique strings  
- For other JSON fields: suggested_value must be valid JSON matching the field's expected schema
- Include an example so the AI knows the format

Update the tool schema for `recommended_improvements` to add a description on `suggested_value` reinforcing this.

#### 3. `supabase/functions/apply-improvement/index.ts` -- Add merge-not-replace logic for array fields

Currently, applying a fix for `must_collect_fields` replaces the entire array. Instead:
- For array fields, **merge** the suggested items into the existing array (append new items, don't drop existing ones)
- Deduplicate by checking if a semantically similar field already exists
- This prevents a fix for "add Medicaid question" from wiping out "zip code" and "phone verification"

### Data Recovery

After deploying the fix, we also need to restore the corrupted spec for this agent. The plan will include a one-time repair: read the original `must_collect_fields` array from the improvements history (the `from_version` patches show what it was before corruption), and restore it.

### Technical Details

| File | Change |
|---|---|
| `supabase/functions/apply-improvement/index.ts` | Add array coercion for JSON array fields. Add merge logic instead of full replacement for array fields. |
| `supabase/functions/evaluate-call/index.ts` | Add format constraints to evaluator prompt for suggested_value. Add description to tool schema. |

### What This Fixes

- `must_collect_fields` will always remain a valid array, so all required questions appear in the prompt
- `humanization_notes` will always remain a valid array, so warm transfer and rapport techniques are injected
- Future "Apply Fix" clicks will add to existing instructions rather than replacing them
- The evaluator will be guided to return properly structured values

