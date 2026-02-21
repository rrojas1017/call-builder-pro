

# Manage Retell Agents Directly from the App

## Problem
Right now, when you choose "Append" (Retell) as your voice provider, you have to go to the Retell dashboard to create an agent, then copy-paste the agent ID back into the app. You also can't change agent settings (like switching from "transfer" to "outbound" type) without leaving the app.

## Solution
Build a backend function that proxies Retell's Agent API, so you can create, update, and list Retell agents entirely from within the app — no dashboard hopping.

## Changes

### 1. New backend function: `manage-retell-agent`
A single function that handles three operations via the Retell API:

- **create**: `POST https://api.retellai.com/create-agent` — Creates a new Retell agent with your chosen voice, language, and webhook URL pre-configured. Returns the new `agent_id` which gets saved automatically.
- **update**: `PATCH https://api.retellai.com/update-agent/{agent_id}` — Updates an existing agent's settings (voice, language, webhook events, agent name).
- **get**: `GET https://api.retellai.com/get-agent/{agent_id}` — Fetches the current agent config so the UI can display its status (including whether it's a transfer agent vs outbound).

The webhook URL will be auto-set to `receive-retell-webhook` so you never have to configure that manually either.

### 2. Update Create Agent page
When Retell is selected as the voice provider:
- Replace the manual "Agent ID" text input with a **"Create Retell Agent"** button
- On click, the backend function creates a Retell agent with the current voice/language settings and auto-fills the agent ID
- If an agent ID already exists, show a card with the agent's current config and an "Update" button
- Show the agent type (outbound vs transfer) so you can spot misconfiguration

### 3. Update Edit Agent page
Same treatment:
- If a Retell agent ID is set, fetch and display its config (type, voice, status)
- Show an alert if the agent type is "transfer" (can't make outbound calls) with a fix button
- Allow updating the Retell agent's settings directly from the form
- Keep the manual ID input as a fallback (collapsible "Advanced" section)

### 4. Auto-configure webhook on agent creation
When creating a Retell agent, automatically set:
- `webhook_url` pointing to `receive-retell-webhook`
- `webhook_events`: `["call_started", "call_ended", "call_analyzed"]`

This eliminates the need to configure webhooks in the Retell dashboard.

## Technical Details

### Backend function structure (`manage-retell-agent/index.ts`)
```text
POST body: { action: "create" | "update" | "get", agent_id?: string, config?: { ... } }

create config fields:
  - agent_name (from persona name)
  - voice_id (Retell voice ID)
  - language (mapped from spec)
  - webhook_url (auto-set)
  - webhook_events (auto-set)

update config fields:
  - Same as create, plus ability to change any setting

get returns:
  - agent_id, agent_name, voice_id, language, webhook_url, agent_type, status
```

### UI flow for Create Agent
```text
1. User selects "Append" provider
2. Clicks "Create Retell Agent"
3. Backend creates agent via Retell API
4. agent_id auto-saved to agent_specs
5. Success card shows agent details
```

### UI flow for Edit Agent (existing Retell agent)
```text
1. Page loads, detects retell_agent_id
2. Fetches agent config from Retell via backend
3. Displays agent status card (type, voice, webhook)
4. If type is "transfer" -> warning banner + "Switch to Outbound" button
5. Save syncs changes to both local DB and Retell API
```

## Files Changed
- **New**: `supabase/functions/manage-retell-agent/index.ts`
- **Modified**: `src/pages/CreateAgentPage.tsx` (Retell section)
- **Modified**: `src/pages/EditAgentPage.tsx` (Retell section)

