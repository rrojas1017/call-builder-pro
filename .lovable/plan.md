

# Bulk Sync: Auto-Create Retell Agents for All Unprovisioned Specs

## Problem
8 out of 9 agents are missing a `retell_agent_id`. Manually opening and saving each one is tedious.

## Solution
Create a new edge function `bulk-sync-retell-agents` that:
1. Fetches all `agent_specs` where `retell_agent_id IS NULL`
2. For each, joins to `agent_projects` to get the project name and description
3. Calls Retell's `POST /create-agent` API for each
4. Injects the `general_prompt` (from project description/source_text) into the auto-created LLM
5. Updates the `agent_specs` row with the new `retell_agent_id`
6. Returns a summary of what was created

Then add a "Sync All Agents" button on the Agents page to trigger it.

## New Edge Function: `bulk-sync-retell-agents`

```text
1. Auth: requires valid user token (service role for DB writes)
2. Query: SELECT specs + projects WHERE retell_agent_id IS NULL
3. For each spec:
   a. POST /create-agent with { agent_name, voice_id, language }
   b. Extract llm_id from response
   c. If description/source_text exists, PATCH /update-retell-llm/{llm_id} with general_prompt
   d. UPDATE agent_specs SET retell_agent_id = new_id WHERE id = spec.id
4. Return { synced: count, results: [{ project_name, agent_id, status }] }
```

## Frontend: AgentsPage.tsx
- Add a banner/button at the top when unprovisioned agents exist: "X agents need Retell sync -- Sync All Now"
- On click, invoke `bulk-sync-retell-agents`, show progress toast, refresh the list

## Files
- **New**: `supabase/functions/bulk-sync-retell-agents/index.ts`
- **Modified**: `src/pages/AgentsPage.tsx` -- add sync banner/button
- **Modified**: `supabase/config.toml` -- add function config with `verify_jwt = false`

## Language Mapping
The function will map short language codes (en, es, fr, etc.) to Retell's format (en-US, es-ES, etc.) just like CreateAgentPage does.

## Prompt Trimming
Same 28k character limit as the existing `manage-retell-agent` create action.
