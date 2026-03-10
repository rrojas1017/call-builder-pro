

## Analysis: Save & Learn Already Applies Improvements

The existing `handleSaveAndLearn` in `LiveSimulationChat.tsx` (lines 333-353) **already does exactly what you described**:

1. Calls `evaluate-call` and gets the evaluation response
2. Extracts `recommended_improvements` (or `recommended_fixes`)
3. Filters for `critical` and `important` severity
4. Loops through and calls `apply-audit-recommendation` for each
5. Tracks applied count and shows a toast with the score and fix count

**One minor improvement worth making**: The `category` field currently passes the recommendation's severity (`"critical"` or `"important"`) instead of `"save_and_learn"`. Changing this to `"save_and_learn"` would:
- Make it consistent with the Safe Learning Gates plan (where category is used to gate live-call-originated changes)
- Make audit trail clearer about where the change originated

### Change

**`src/components/LiveSimulationChat.tsx`** — Line 344: Change `category: rec.severity` to `category: "save_and_learn"`

That's it — a one-line change. The rest of the pipeline is already wired up correctly.

### If the agent still isn't learning

The issue may not be in this file. More likely causes:
- `apply-audit-recommendation` is failing silently (the catch on line 349 swallows errors)
- The recommendation text format doesn't match what the AI mapper expects
- The Retell resync (added in the previous fix) isn't completing

We could add `console.warn` logging to the catch block to surface failures, which would help diagnose if improvements are being attempted but failing.

