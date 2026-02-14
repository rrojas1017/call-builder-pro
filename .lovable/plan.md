

## Fix: Allow Re-Applying Fixes for Previously Updated Fields

### Problem
The "Apply Fix" button uses field-name matching (`normalizeField(imp.field)`) to determine if a fix was already applied. Once a field like `qualification_rules` has been patched, every future suggestion targeting that same field shows a disabled "Applied" badge -- even if the new suggestion has a completely different value (e.g., moving criteria around).

This blocks iterative improvement, which is a core part of the agent training loop.

### Solution
Change the matching logic from **field-name only** to **field + suggested value**. This way:
- If the exact same suggestion was applied before, it stays "Applied"
- If a new evaluation suggests a different value for the same field, the button is active again

### Changes

**All three files** that have this pattern need updating:

1. **`src/pages/GymPage.tsx`**
2. **`src/components/TestResultsModal.tsx`**  
3. **`src/pages/CallsPage.tsx`**

For each file:

- Change the applied-fix tracking from storing just the normalized field name to storing a composite key: `field::value_hash`
  - The key will be: `normalizeField(imp.field) + "::" + JSON.stringify(imp.suggested_value)`
- Update all `appliedFixes.includes(...)` / `appliedSet.has(...)` checks to use the composite key
- Update the `handleApplyFix` callback to store the composite key after successful application

### Technical Detail

A helper function will be added to each file:

```
const improvementKey = (imp: any) =>
  normalizeField(imp.field) + "::" + JSON.stringify(imp.suggested_value);
```

Then everywhere that currently does:
```
appliedFixes.includes(normalizeField(imp.field))
```
It becomes:
```
appliedFixes.includes(improvementKey(imp))
```

And in `handleApplyFix`, instead of:
```
setAppliedFixes(prev => [...prev, normalizeField(improvement.field)])
```
It becomes:
```
setAppliedFixes(prev => [...prev, improvementKey(improvement)])
```

### What stays the same
- The `apply-improvement` edge function (no backend changes)
- The improvements table schema
- The normalize logic (still needed for the edge function's field patching)
- All other UI and evaluation logic

