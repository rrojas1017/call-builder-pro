

## Fix: Hide Already-Applied Improvements in Test Results Modal

### Problem
The `TestResultsModal.tsx` component (shown on the `/test` page) tracks applied fixes only in local component state (`appliedFixes`). When the modal is reopened or a past test run is viewed, the state resets to empty, so all improvements appear clickable even if they were already applied.

### Solution
Add the same database-backed check used in `CallsPage.tsx`: when the modal opens, fetch all previously applied improvements from the `improvements` table and pre-populate the `appliedFixes` list.

### Changes

**`src/components/TestResultsModal.tsx`**

1. Add a `useEffect` that runs when `open` changes and `projectId` is available:
   - Query `supabase.from("improvements").select("patch").eq("project_id", projectId)`
   - Extract all patch keys (excluding `version`) into a flat list
   - Set `appliedFixes` to this list so the UI immediately reflects what has already been applied

2. The existing rendering logic already checks `appliedFixes.includes(imp.field)` -- but the field names from the evaluation may contain parenthetical descriptions (e.g. `"humanization_notes (implied rewrite of prompt)"`), while the patch keys are normalized (e.g. `"humanization_notes"`). Add a `normalizeField` helper (same as in `CallsPage.tsx`) and use normalized comparison:
   - Normalize `imp.field` before checking against the applied set
   - Also normalize when adding to `appliedFixes` after a successful apply

3. The "Apply All Fixes" button's disabled check will also use normalized comparison so it correctly detects when all fixes are already applied.

### What stays the same
- The "Apply Fix" button still works for unapplied improvements
- Successfully applying a fix still adds it to the local state for immediate UI feedback
- No database schema changes needed

