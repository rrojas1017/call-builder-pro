

## Persist Last Evaluation and Show Historical Results on Gym Page

### Problem
When you navigate away from the Gym page and come back, the last test result disappears because it's only stored in React state (memory). You also can't see a history of past test calls to track how the agent is improving over time.

### Solution
1. **Auto-load the most recent test result** when the page loads, so you always see the last evaluation
2. **Add a historical results list** showing past Gym test calls with scores, so you can see improvement over time

### Changes

**File: `src/pages/GymPage.tsx`**

1. **Load last test result on mount**: When the page loads with a selected agent, query `test_run_contacts` (joined with `test_runs`) for the most recent completed contact for that agent. Pre-populate the `contact` state so the evaluation card is visible immediately.

2. **Add a "History" section** below the current result card:
   - Query the last 10-20 completed test contacts for the selected agent
   - Display each as a compact row showing: date, outcome, overall score, humanness score, and a button to expand/view full details
   - Highlight score changes (up/down arrows or color) compared to the previous test
   - Clicking a history row loads that result into the detail view

3. **Persist `testRunId` in URL params**: Store the active `testRunId` as a search param so refreshing the page also restores the in-progress or completed test

4. **Re-fetch history after each new test completes**: Append the new result to the history list automatically

### Technical Details

**Loading last result on mount (new `useEffect`)**:
- Query: `test_run_contacts` joined with `test_runs` where `test_runs.project_id = agentId`, ordered by `created_at desc`, limit 1
- Set both `contact` and `testRunId` state from the result
- Only runs when `agentId` changes and no active test is running

**History list (new `useEffect` + state)**:
- New state: `history: TestContact[]` and `selectedHistoryId: string | null`
- Query: same join but limit 20, all completed contacts with evaluations
- Render as a compact table/list with columns: Date, Outcome, Overall, Humanness, Naturalness
- Each row is clickable to load full details into the existing result card
- Add delta indicators (green up arrow / red down arrow) comparing each score to the previous entry

**URL persistence**:
- Use `useSearchParams` (already imported) to store `testRunId` when a test starts
- On mount, check for `testRunId` in URL params and restore that test's contact data

### Files to Modify
- `src/pages/GymPage.tsx` -- add history state, load-last-result effect, history UI section, URL param persistence

