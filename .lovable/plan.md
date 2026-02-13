

## Hide "Apply Improvement" Button for Already-Applied Fixes

### Problem
When viewing past calls, the "Apply Improvement" buttons still appear even if the fix was already applied. This is confusing and risks applying the same change twice.

### Solution
When a call is selected, fetch the `improvements` table for that call's `project_id` and cross-reference each recommended improvement with already-applied records. If a match is found, show an "Applied" badge instead of the button.

### Changes

**`src/pages/CallsPage.tsx`**

1. Add a new state: `appliedImprovements` to hold fetched improvement records for the selected call's project.
2. Add a state: `appliedSet` (a `Set<string>`) built from the fetched improvements, keyed by a normalized field name from the `patch` keys.
3. When `selected` changes (and has evaluation data), query:
   ```
   supabase.from("improvements").select("patch, change_summary").eq("project_id", selected.project_id)
   ```
4. Build a set of applied field names from each improvement's `patch` keys (excluding `version`).
5. In the recommended improvements render loop, check if `imp.field` (normalized -- strip parenthetical suffixes, replace `/` with `.`) exists in the applied set.
6. If matched: replace the "Apply Improvement" button with a green "Applied" badge (using `CheckCircle2` icon, already imported).
7. If not matched: show the button as before.
8. Also add the improvement to the applied set locally after a successful apply, so it immediately shows as "Applied" without re-fetching.

### Visual Change
- **Before**: Every recommended improvement shows an "Apply Improvement" button
- **After**: Already-applied improvements show a green "Applied" label; unapplied ones still show the button

### Technical Notes
- Field matching uses the same normalization as `apply-improvement` edge function: strip `(...)` suffixes, replace `/` with `.`
- The `improvements` table `patch` column contains the fields that were changed, so we match on patch keys
- No database changes needed
