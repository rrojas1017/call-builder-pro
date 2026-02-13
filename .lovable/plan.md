

## Fix: Hide Already-Applied Improvements in GymPage (Test Lab)

### Problem
The GymPage (`/test` route) has the same "Apply Fix" buttons for recommended improvements, but it was never updated to fetch previously applied fixes from the database. Every time a test result is viewed, `appliedFixes` resets to an empty array, so all improvements appear clickable -- even ones that were already applied.

### Changes

**`src/pages/GymPage.tsx`**

1. Add a `normalizeField` helper (same as in CallsPage and TestResultsModal):
   ```
   const normalizeField = (field: string) =>
     field.replace(/\s*\(.*\)\s*$/, "").replace(/\//g, ".").trim();
   ```

2. Add a `useEffect` to fetch applied improvements whenever a contact with evaluation data is displayed. It will:
   - Query `supabase.from("improvements").select("patch").eq("project_id", selectedProjectId)`
   - Extract patch keys (excluding `version`) and normalize them
   - Set `appliedFixes` to this list

3. Update the `handleApplyFix` function to normalize the field name before adding to `appliedFixes`.

4. Update the `ResultCard` component's comparison logic to use `normalizeField(imp.field)` when checking against `appliedFixes` (lines 638, 640, 644).

### What stays the same
- The "Apply Fix" button still works for unapplied improvements
- No database changes needed

