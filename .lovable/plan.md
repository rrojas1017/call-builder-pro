

## Fix "Apply Fix" Button Reverting After a Few Seconds

### Root Cause

In `GymPage.tsx`, a 5-second polling interval (line 273) continuously refetches the test contact and calls `setContact(data)`, creating a **new object reference every poll cycle**. The `useEffect` that fetches already-applied improvements (line 94) has `contact` in its dependency array, so it re-runs every 5 seconds. This causes a brief moment where `appliedFixes` is reset to whatever the DB returns, creating a visual "flicker" where the button reverts from "Applied" back to "Apply Fix" before settling again.

The same pattern exists in `TestResultsModal.tsx` but is less noticeable since it lacks the polling interval.

### Fix

**File: `src/pages/GymPage.tsx`**

1. **Remove `contact` from the `fetchApplied` dependency array** (line 114). The applied improvements only depend on `selectedProjectId`, not on the contact object. Change `[selectedProjectId, contact]` to `[selectedProjectId]`.

2. **Re-fetch applied fixes after a successful apply** -- after `setAppliedFixes((prev) => [...prev, improvementKey(improvement)])` in `handleApplyFix`, this is already handled by the local state update. But to ensure consistency, also trigger a refetch when the fix is applied by extracting `fetchApplied` into a stable callback and calling it after apply.

3. **Stop polling when the call is completed** -- inside the `setInterval` callback, skip `setContact` if the status hasn't changed (compare with current contact to avoid unnecessary re-renders). Alternatively, clear the interval when `status` is not `queued` or `calling`.

### Files Changed

| File | Change |
|---|---|
| `src/pages/GymPage.tsx` | Remove `contact` from the `fetchApplied` effect dependency array; stop polling interval when call is completed |

