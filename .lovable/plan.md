

# Bug: `apply-improvement` Overwrites Business Rules with `false`

## Root Cause

**Line 232 in `supabase/functions/apply-improvement/index.ts`** contains a misplaced boolean assignment that executes for ALL `JSON_FIELDS`, not just `BOOL_FIELDS`:

```javascript
// Line 201-231: carefully merges business_rules, arrays, etc.
// ...then IMMEDIATELY on line 232:
patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
```

This line was meant to be inside the `BOOL_FIELDS` branch (line 232 should be after `} else if (BOOL_FIELDS.includes(field)) {`), but instead it sits at the end of the `JSON_FIELDS` block. So after all the careful deep-merge logic runs for `business_rules`, `humanization_notes`, `must_collect_fields`, etc., the result is **immediately overwritten with `false`** (since the suggested value is never literally `"true"`).

This means every time `apply-improvement` processes a JSON field — including business_rules — the final patch is `{ business_rules: false }`, which **erases** all rules.

## Evidence

The edge function logs show `"Merged humanization_notes: 0 existing + 3 incoming → 3 total"` — the merge runs correctly, but the output is then overwritten by line 232.

## Fix

### `supabase/functions/apply-improvement/index.ts`

Move line 232 into the correct branch. The `} else if (BOOL_FIELDS.includes(field))` block is missing its body — line 232 needs to be inside it:

**Before (lines 229-233):**
```javascript
      } else {
        patch[field] = parsedValue;
      }
      patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
    } else if (NUM_FIELDS.includes(field)) {
```

**After:**
```javascript
      } else {
        patch[field] = parsedValue;
      }
    } else if (BOOL_FIELDS.includes(field)) {
      patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
    } else if (NUM_FIELDS.includes(field)) {
```

This is a one-line structural fix. The boolean conversion line becomes its own proper branch instead of dangling at the end of the JSON block.

| File | Change |
|------|--------|
| `supabase/functions/apply-improvement/index.ts` | Move line 232 into a proper `BOOL_FIELDS` else-if branch |

