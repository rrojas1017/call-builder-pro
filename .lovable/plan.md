

## Apply Pending Fixes for ACA Qualifier

### Current State

The ACA Qualifier agent (version 46) already has both recommended values in its spec:
- **interruption_threshold**: already set to `1000` (matching the suggestion)
- **must_collect_fields**: already includes "What is your life event?" and "Are you currently on Medicaid?" (covering the suggestion)

However, the UI still shows "Apply Fix" buttons because no improvement record with the exact composite key exists in the `improvements` table for these specific recommendations.

### Plan

**Apply both fixes via the existing `apply-improvement` edge function** so they are recorded in the `improvements` table and the UI reflects them as "Applied":

1. **Call `apply-improvement`** for `must_collect_fields` with the suggested value from the evaluation. Since the edge function uses merge-instead-of-replace for array fields, this will safely deduplicate and not corrupt existing fields.

2. **Call `apply-improvement`** for `interruption_threshold` with value `1000`. Since it is already 1000, the only effect is a version bump and the improvement being recorded.

3. After both calls succeed, the `TestResultsModal` / `UniversityPage` will automatically detect the matching keys in the `improvements` table and render green "Applied" badges instead of "Apply Fix" buttons.

### Technical Details

- No code changes needed -- the existing `handleApplyFix` and `handleApplyAllFixes` functions in `TestResultsModal.tsx` already handle this correctly.
- The edge function `apply-improvement` handles array merging and deduplication, so calling it for `must_collect_fields` is safe.
- The version will bump from 46 to 48 (one bump per fix), which is expected behavior.
- The `improvementKey` function (`normalizeField(field) + "::" + JSON.stringify(suggested_value)`) is used to track applied status -- once improvements are recorded, the UI will match them.

### Implementation

I will invoke the `apply-improvement` edge function twice in sequence with the exact field/value pairs from the evaluation's `recommended_improvements`, then verify the spec version and improvement records are correct.

