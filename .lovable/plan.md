

## Edit Agents + Dynamic Bland Voice List

### What This Solves
1. **No way to edit agents after creation** -- currently you can only create, not modify
2. **Hardcoded voice list** -- the app shows 8 static voices that may not match your Bland account, causing "Voice does not belong to user" errors

### Changes

**1. New Edge Function: `list-bland-voices`**
- Calls `GET https://us.api.bland.ai/v1/voices` with your `BLAND_API_KEY`
- Returns the list of voices available on your Bland account
- Caches nothing -- always fresh from the API

**2. New Page: `EditAgentPage.tsx`**
- Loads the agent's current settings from `agent_projects` (name, description) and `agent_specs` (voice, transfer settings, opening line, tone, etc.)
- Displays editable fields for:
  - Agent name and description
  - Voice selection (fetched live from Bland API -- only voices YOU have access to)
  - Transfer settings (enable/disable, phone number)
  - Opening line and tone style
- Saves changes back to both `agent_projects` and `agent_specs` tables
- Reuses the same card-based UI style from CreateAgentPage

**3. New Route: `/agents/:id/edit`**
- Added to `App.tsx` under the protected layout

**4. Update `AgentsPage.tsx`**
- Add an "Edit" link on each agent card (alongside Test and Knowledge)

**5. Update `CreateAgentPage.tsx`**
- Replace the hardcoded `BLAND_VOICES` array with a live fetch from the new `list-bland-voices` edge function
- Show a loading state while voices load
- This prevents invalid voices from being selected during creation too

**6. Update `supabase/config.toml`** (if needed)
- Add the new `list-bland-voices` function entry

### Files to Create
- `supabase/functions/list-bland-voices/index.ts` -- edge function to proxy Bland API
- `src/pages/EditAgentPage.tsx` -- edit page for existing agents

### Files to Modify
- `src/App.tsx` -- add `/agents/:id/edit` route
- `src/pages/AgentsPage.tsx` -- add Edit link to agent cards
- `src/pages/CreateAgentPage.tsx` -- replace hardcoded voices with live fetch

### How Voice Selection Works After This Change

```text
User opens Create or Edit agent
        |
        v
Frontend calls list-bland-voices edge function
        |
        v
Edge function calls GET https://us.api.bland.ai/v1/voices
with BLAND_API_KEY header
        |
        v
Returns only voices available to YOUR account
        |
        v
UI renders voice cards (name, description, tags)
+ "Custom Voice ID" option for cloned voices
```

### What the Edit Page Includes
- Agent name and description (from `agent_projects`)
- Voice selection (live from Bland)
- Transfer toggle and phone number
- Opening line (editable text)
- Tone/style setting
- Save button that updates both tables
