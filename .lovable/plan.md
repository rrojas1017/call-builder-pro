

## Stop Auto-Loading Old Test Results When Returning to Gym

### Problem
Every time you leave the Gym page and come back, it automatically loads the most recent prior call result -- even if all fixes were already applied and reviewed. This is annoying because you've already dealt with that feedback.

### Root Cause
Lines 129-152 in `src/pages/GymPage.tsx` run an `init()` function whenever `agentId` changes (including on page load). This function:
1. Loads call history
2. If no active test is running AND no contact is loaded, it auto-selects the most recent completed call as the active result
3. It also checks the URL for a `testRunId` param and restores that

This means every page visit shows stale results you've already reviewed.

### Solution
Only auto-load a prior result if there's an **active `testRunId` in the URL** (meaning you navigated away mid-test). Otherwise, start with a clean slate -- no result card shown. The history table still loads so you can click into old results if you want, but nothing is forced on you.

### Changes

**File: `src/pages/GymPage.tsx`** (lines 129-152)

Update the `init()` logic inside the `useEffect`:
- Keep loading history (so the history table and trend chart populate)
- Only auto-restore a contact if `testRunId` is present in the URL params
- Remove the fallback that loads `rows[0]` (the most recent call) when there's no URL param
- Clear the `testRunId` URL param after all fixes are applied (optional, clean UX)

```text
Before:
  if (!running && !contact && rows?.length) {
    // If testRunId is in URL, try to find that contact
    if (urlTestRunId) { ... }
    // Otherwise load the most recent   <-- THIS IS THE PROBLEM
    setContact(rows[0]);
  }

After:
  if (!running && !contact && rows?.length) {
    // Only restore if there's an active testRunId in the URL
    if (urlTestRunId) {
      const match = rows.find((r) => r.test_run_id === urlTestRunId);
      if (match) {
        setContact(match);
        setTestRunId(urlTestRunId);
      }
    }
    // Otherwise: start clean, no auto-loaded result
  }
```

This is a small, focused change -- just removing the 2-line fallback that force-loads the last result.

### What This Means for the User
- Returning to Gym shows a clean form ready for a new test
- History table still shows past calls (clickable if you want to review)
- If you navigate away during an active test, it restores correctly via URL param
- No more stale feedback from already-reviewed calls
