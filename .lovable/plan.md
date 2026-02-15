

## Fix Missing Transcript Lines in Live Monitor

### Root Cause

Two issues cause transcript lines to be missed:

1. **Polling stops too early**: When the call ends, `isActive` flips to `false`, which immediately clears the polling interval via the `useEffect` cleanup. Any transcript lines spoken in the last 2.5 seconds (between the final poll and the cleanup) are never fetched.

2. **Incremental append with deduplication is fragile**: The current approach uses `seenIdsRef` to track which transcript IDs have been added, and only appends new ones. If the Bland API returns transcript IDs in an unexpected order or the component re-mounts (clearing `lines` state but not `seenIdsRef`), lines can be permanently skipped.

### Fix

**File: `src/components/LiveCallMonitor.tsx`**

1. **Replace all lines on each poll instead of incremental append** -- Just like the Retell path already does (line 113: `setLines(parsed)`), switch the Bland path to replace the full `lines` array each poll. This eliminates the `seenIdsRef` deduplication complexity and ensures every transcript line from the API is always shown. Remove `seenIdsRef` entirely.

2. **Do a final fetch when `isActive` turns false** -- Add a cleanup effect that fires one last transcript fetch when `isActive` transitions from `true` to `false`, capturing any lines spoken in the final moments of the call.

3. **Reduce poll interval from 2500ms to 1500ms** -- More frequent polling reduces the window for missed lines during active conversation.

### Technical Details

The key change in the Bland polling effect:

```tsx
// Before: incremental append with deduplication
for (const t of data.transcripts) {
  if (seenIdsRef.current.has(id)) continue;  // fragile!
  seenIdsRef.current.add(id);
  newLines.push(...);
}
setLines((prev) => [...prev, ...newLines]);

// After: full replacement (matches Retell approach)
const allLines = data.transcripts
  .filter(t => t.text?.trim())
  .map(t => ({ id: String(t.id), role: ..., text: t.text }));
setLines(allLines);
```

| File | Change |
|---|---|
| `src/components/LiveCallMonitor.tsx` | Replace incremental append with full replacement; add final fetch on deactivation; reduce poll interval to 1500ms; remove `seenIdsRef` |

