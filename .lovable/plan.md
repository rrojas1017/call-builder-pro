

## Fix: "Applied" Status Matching is Broken for Most Field Types

### Problem
Some improvements correctly show "Applied" (like `tone_style`) while others keep showing "Apply Fix" (like `interruption_threshold` and `humanization_notes`) even after being applied. This happens because the matching logic compares the **original suggested value** against the **stored patch value**, and they differ due to type coercion and array merging.

**Why specific fields fail:**
- `interruption_threshold`: Suggested as string `"150"`, stored in patch as number `150`. `JSON.stringify("150")` != `JSON.stringify(150)`.
- `humanization_notes`: Suggested as 4-item array, stored in patch as merged 8-item array (existing + new). They never match.
- `tone_style`: Works because the patch stores the exact same string as suggested.

### Solution
Store the original improvement key at apply-time, then match against it when checking applied status. The `source_recommendation` column already exists on the `improvements` table (currently all null).

### Changes

**1. Edge Function: `supabase/functions/apply-improvement/index.ts`**
- Read `original_key` from the request body's improvement object
- Store it in the `source_recommendation` column when inserting the improvement record

**2. Frontend: `src/pages/UniversityPage.tsx`**
- In `handleApplyFix`: pass `original_key: improvementKey(improvement)` in the request body
- In the fetch effect: select `source_recommendation` alongside `patch`, and include `source_recommendation` values in the `appliedFixes` array (keeping patch-based keys as fallback for older records)

**3. Frontend: `src/components/TestResultsModal.tsx`**
- Same two changes: pass `original_key` when applying, and fetch `source_recommendation` when loading applied state

**4. Frontend: `src/pages/CallsPage.tsx`**
- Same pattern for consistency across all three UIs that show improvements

### Technical Detail

Edge function insert change:
```
source_recommendation: improvement.original_key || null
```

Frontend fetch change (all three files):
```
.select("patch, source_recommendation")
// Then collect both source_recommendation keys AND patch-based keys
```

Frontend apply change (all three files):
```
improvement: {
  ...existing fields,
  original_key: improvementKey(improvement),
}
```

This ensures exact key matching regardless of how the value is transformed (type coercion, array merging, etc.) during the apply process. Existing already-applied improvements will continue to work via the fallback patch-based matching for `tone_style` and similar text fields.
