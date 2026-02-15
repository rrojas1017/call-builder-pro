

## Fix: `detected_fields` Saved as Empty Object

### Root Cause

In `src/pages/ListsPage.tsx` line 174, the code does:

```text
detected_fields: parseResult.field_map ? parseResult.field_map : parseResult.detected_fields
```

The problem is that `parseResult.field_map` is always truthy -- even when AI returns an empty object `{}` -- because `Boolean({})` is `true` in JavaScript. So the database always gets the `field_map` value, which is `{}` when AI analysis fails or returns nothing useful.

### Fix (Two Files)

| File | Change |
|---|---|
| `src/pages/ListsPage.tsx` (line 174) | Check that `field_map` actually has keys before preferring it over the `detected_fields` array. |
| `supabase/functions/parse-dial-list/index.ts` (line 10) | Add `fname` and `lname` to `NAME_HEADERS` so the heuristic fallback also catches these common field names. |

### Details

**ListsPage.tsx** -- Change the save line to:

```text
detected_fields: parseResult.field_map && Object.keys(parseResult.field_map).length > 0
  ? parseResult.field_map
  : parseResult.detected_fields
```

This ensures that only a non-empty `field_map` object is used. When AI fails or returns `{}`, the raw `detected_fields` array (the actual CSV headers) is saved instead.

**parse-dial-list/index.ts** -- Update `NAME_HEADERS` to include `fname` and `lname`:

```text
const NAME_HEADERS = ["name", "full_name", "first_name", "fname", "lname", "contact", "contact_name", "fullname", "customer"];
```

This improves the heuristic fallback so it correctly identifies first/last name columns without needing AI.

