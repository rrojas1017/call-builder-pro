
## Add "Stop Call" Button to Gym and Test Lab

### Problem
Once a test call is initiated in the Gym or Test Lab, there is no way to stop or interrupt it. The user must wait for the call to complete naturally.

### Solution
Add a "Stop Call" button that appears while a call is in progress. This button will:
1. Call a new Edge Function that hits Bland AI's stop endpoint (`POST /v1/calls/{call_id}/stop`)
2. Update the contact/test record status to "cancelled"
3. Reset the UI so the user can start a new call immediately

### Bland AI Endpoint
- `POST https://us.api.bland.ai/v1/calls/{call_id}/stop`
- Requires the `Authorization` header with the Bland API key
- Returns `{ "status": "success", "message": "Call ended successfully." }`

### Changes

**1. New Edge Function: `supabase/functions/stop-call/index.ts`**
- Accepts `{ call_id: string, source: "gym" | "test_lab", contact_id: string }`
- Calls Bland AI's stop endpoint using the stored `BLAND_API_KEY`
- Updates the relevant record:
  - For Gym (`test_run_contacts`): set status to "cancelled"
  - For Test Lab (`test_run_contacts`): set status to "cancelled"
- Returns success/failure

**2. Update Gym page (`src/pages/GymPage.tsx`)**
- Store the `bland_call_id` from the test run contact (fetched via realtime subscription)
- Replace the disabled "Calling..." button with a red "Stop Call" button while `running` is true and a `bland_call_id` is available
- On click, invoke the `stop-call` edge function, then reset `running` to false

**3. Update Test Lab (`src/components/TestLabSection.tsx`)**
- Similar treatment: show a "Stop Call" button next to or replacing the run button while calls are active
- Track the test run's contact IDs and their bland_call_ids to allow stopping

### What Users Will See
- In the Gym: the "Calling..." button becomes a red "Stop Call" button once the call connects
- Clicking it immediately ends the call on Bland AI's side
- The status updates to "cancelled" and the user can start a new test right away
- In the Test Lab: a "Stop All" button appears during active test runs

### Files to Create
- `supabase/functions/stop-call/index.ts`

### Files to Modify
- `src/pages/GymPage.tsx` -- add stop button, track bland_call_id
- `src/components/TestLabSection.tsx` -- add stop button for active test runs
