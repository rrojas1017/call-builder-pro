

# Add "Ignore" Option for Post-Call Recommended Improvements

## Summary

Currently, when viewing a call's evaluation on the Calls page (historical calls), each recommended improvement only shows an "Apply Improvement" button or an "Applied" badge. Users have no way to dismiss/ignore suggestions they disagree with. This change adds an "Ignore" button alongside "Apply" so users can explicitly skip fixes.

## Changes

### `src/pages/CallsPage.tsx`

1. **Add `ignoredSet` state** — a `Set<string>` tracking ignored improvement keys (same key format as `appliedSet`), persisted only in the current session (no DB change needed).

2. **Update the improvement card UI** (lines 718-727) — replace the single "Apply Improvement" button with a two-button layout:
   - If already applied → show green "Applied" badge (unchanged)
   - If ignored → show muted "Ignored" badge with an "Undo" option
   - Otherwise → show two buttons side by side: **"Ignore"** (ghost/outline) and **"Apply Fix"** (primary/outline with Zap icon)

3. **Add `handleIgnoreImprovement` handler** — adds the improvement key to `ignoredSet`

No database changes needed — ignore state is session-only (if the user revisits the call, unignored items reappear). This is intentional: ignored suggestions may become relevant after further training.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/CallsPage.tsx` | Add `ignoredSet` state, ignore handler, update improvement card to show Ignore / Apply buttons |

