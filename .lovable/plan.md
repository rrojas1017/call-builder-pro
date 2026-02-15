

## Fix: Campaign Creation Fails With "No Valid Contacts Found"

### Root Cause

When a list is uploaded, the `detected_fields` column is saved as an empty object `{}`. The campaign creation code relies on `detected_fields` to figure out which columns contain phone numbers and names. Since it's empty, the code can't find any phone/name columns, marks every contact's phone as `""`, filters them all out, and shows the error.

Your actual data looks like `{ fname: "Ramon", lname: "Rojas", phone: "+14076393814" }` -- the keys are right there in the row data, the code just doesn't look at them when `detected_fields` is empty.

### Fix

**File:** `src/pages/CampaignsPage.tsx`

When `detected_fields` yields an empty fields array, fall back to extracting keys from the first row's `row_data`. This way the heuristic phone/name detection still works regardless of whether `detected_fields` was populated.

```text
Current (line ~118):
  const fields = ... from detected_fields ...
  
Changed to:
  let fields = ... from detected_fields ...
  // Fallback: if no fields detected, infer from actual row data keys
  if (fields.length === 0 && rows.length > 0) {
    fields = Object.keys((rows[0] as any).row_data || {});
  }
```

This is a one-line addition that makes the existing phone/name heuristic (`phoneCols`, `nameCols`) work correctly with the actual data keys like `phone`, `fname`, etc.

### Also Fix Name Detection

The current `nameCols` list doesn't include `fname`. Since the data uses `fname`/`lname`, add `fname` to the name column heuristics so the contact name is properly extracted. Additionally, combine `fname` + `lname` when both exist.

### Technical Summary

| File | Change |
|---|---|
| `src/pages/CampaignsPage.tsx` | Add fallback to infer fields from `row_data` keys when `detected_fields` is empty. Add `fname` to `nameCols`. Combine `fname`+`lname` for full name. |
