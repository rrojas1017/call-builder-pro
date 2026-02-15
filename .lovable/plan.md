
## Fix: Applied Fixes Reset When Selecting Prior Call History

### Problem
When you click on a prior call in the history list, the "Applied" badges disappear and all improvements show "Apply Fix" buttons again, even though they were already applied.

### Root Cause
In `UniversityPage.tsx`, when a history item is selected (`handleSelectHistory`, line 363), the code calls `setAppliedFixes([])` to clear the list. The `useEffect` that re-fetches applied fixes from the database (line 94) only has `selectedProjectId` in its dependency array. Since `selectedProjectId` (the agent ID) doesn't change when switching between calls, the effect never re-runs, and the applied fixes stay empty.

### Fix

**File: `src/pages/UniversityPage.tsx`**

Two changes:

1. **Remove the early return that depends on `contact`** (line 95). The applied fixes are agent-wide (not call-specific), so they should always be fetched when `selectedProjectId` is available, regardless of the current contact state.

2. **Add a re-fetch trigger when history is selected.** Instead of clearing `appliedFixes` to `[]` in `handleSelectHistory`, trigger a re-fetch. The simplest approach: add a counter state (e.g., `appliedRefreshKey`) that increments on history selection and is included in the useEffect dependency array.

Specifically:
- Add state: `const [appliedRefreshKey, setAppliedRefreshKey] = useState(0);`
- In `handleSelectHistory` (line 363): replace `setAppliedFixes([])` with `setAppliedRefreshKey(k => k + 1)`
- In the useEffect (line 94): remove the guard on `contact?.evaluation?.recommended_improvements?.length`, and add `appliedRefreshKey` to the dependency array
- Keep the `setAppliedFixes([])` in the agent-change reset (line 123) and the new-run reset (line 296) as those are correct behaviors
