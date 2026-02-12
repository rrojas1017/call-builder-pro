

# Simplified "Quick Test" Flow

## The Idea
Replace the multi-step Test Lab with a dead-simple experience: **Pick agent -> Enter phone number -> Click Test**. One screen, three actions, done.

## What Changes

### 1. New Page: `/test` (QuickTestPage.tsx)

A clean, focused page with just three elements:

```text
+-----------------------------------------------+
|  Quick Test                                    |
|                                                |
|  Agent:  [ Select an agent        v ]          |
|                                                |
|  Phone:  [ +1 555 123 4567          ]          |
|                                                |
|  [ Run Test Call ]                             |
|                                                |
|  --- After clicking: ---                       |
|                                                |
|  Status: Calling...  (spinner)                 |
|  Transcript: (streams in live)                 |
|  Score: 87 / Outcome: Qualified                |
|  [Recommended fixes with Apply Fix buttons]    |
+-----------------------------------------------+
```

- **Agent dropdown**: Loads all `agent_projects` for the user's org
- **Phone input**: Single phone number field with auto-normalization
- **Run Test Call**: Creates a 1-contact test run, fires the call, shows results inline (no modal needed)
- Results appear on the same page below the button -- transcript, evaluation, and Apply Fix buttons

### 2. Navigation
- Add "Test" item to the sidebar (between "Agents" and "Campaigns")
- Add a "Test" button on each agent card in the Agents page for quick access (`/test?agent=<id>`)

### 3. Reuse Existing Backend
No new edge functions needed. The flow calls:
1. `create-test-run` with 1 contact
2. `run-test-run` to fire the Bland call
3. Subscribes to Realtime updates on `test_run_contacts` for live status
4. Shows evaluation + Apply Fix buttons (reusing existing `apply-improvement` function)

### 4. Keep Existing Test Lab in Wizard
The current Test Lab in Step 3 of the wizard stays as-is for bulk testing during agent creation. This new page is for quick one-off tests anytime.

---

## Technical Details

### Files to Create
- `src/pages/QuickTestPage.tsx` -- the main page component

### Files to Modify
- `src/App.tsx` -- add `/test` route
- `src/components/AppSidebar.tsx` -- add "Test" nav item
- `src/pages/AgentsPage.tsx` -- add "Test" button on each agent card

### QuickTestPage.tsx Structure
- Loads agents from `agent_projects` on mount
- If `?agent=<id>` query param exists, pre-selects that agent
- Single phone input with normalization (strip non-digits, prepend +1 if 10 digits)
- On "Run Test Call":
  1. Call `create-test-run` with 1 contact (name defaults to "Quick Test")
  2. Call `run-test-run`
  3. Subscribe to Realtime on `test_run_contacts` for that test_run_id
  4. Show inline results: status, transcript, evaluation scores, recommended improvements with Apply Fix buttons
- Apply Fix reuses the same `apply-improvement` edge function call pattern from `TestResultsModal`

