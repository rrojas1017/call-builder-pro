

# Simplify Retell (Append) Integration -- Make It as Easy as Bland

## Vision
Users should never need to open the Retell dashboard. Your platform should handle everything: creating agents, setting prompts, purchasing numbers, assigning them, and making calls -- all from the same simple UI they already use for Voz (Bland).

## Current Gaps

1. **Agent creation doesn't inject the prompt** -- When a Retell agent is created via the wizard, the LLM's `general_prompt` stays blank. The agent only gets its instructions right before a test call (added recently), but campaigns via `tick-campaign` skip this entirely.

2. **tick-campaign missing prompt injection** -- The Retell branch in `tick-campaign` sends batch calls but never updates the LLM prompt first, so production campaign calls won't follow instructions.

3. **No Retell number purchase/management** -- The `manage-inbound-numbers` function only talks to Bland's API. Users can't buy or manage Retell phone numbers from the platform.

4. **Retell agent creation requires manual steps** -- Users must click "Create Append Agent" separately. It should happen automatically when they save the agent with Retell selected.

5. **No auto-assign outbound agent to purchased number** -- Retell's API supports binding an `outbound_agent_id` to a phone number, but the platform doesn't do this.

## Plan

### 1. Auto-create Retell agent + inject prompt on save (CreateAgentPage)
When the user saves an agent with "Append" selected and no `retell_agent_id` exists yet:
- Automatically call `manage-retell-agent` with action `create`
- Then immediately inject the task prompt into the new agent's LLM
- Save the returned `agent_id` to the spec
- No manual "Create Append Agent" button needed

**File**: `src/pages/CreateAgentPage.tsx` (modify `handleSaveAgent`)

### 2. Inject prompt into LLM at agent creation time
Update `manage-retell-agent` create action to also set the `general_prompt` on the auto-created LLM. This way the agent is ready to call immediately after creation.

**File**: `supabase/functions/manage-retell-agent/index.ts`
- After creating the agent, fetch the `llm_id` from the response
- PATCH the LLM with an initial `general_prompt` if one is provided in the config

### 3. Add prompt injection to tick-campaign (Retell branch)
Mirror the same logic added to `run-test-run`: before dispatching the batch, fetch the agent's `llm_id`, build the task prompt, and PATCH the LLM.

**File**: `supabase/functions/tick-campaign/index.ts`
- Before the batch call, GET the agent to extract `llm_id`
- Build prompt using `buildTaskPrompt` (already available in the file)
- PATCH `/update-retell-llm/{llm_id}` with `{ general_prompt: taskPrompt }`
- Also auto-fix `is_transfer_agent` if detected (same pre-flight as run-test-run)

### 4. Add Retell phone number purchase and management
Create a new edge function `manage-retell-numbers` that wraps Retell's phone number API:
- **purchase**: `POST /create-phone-number` with area code and optional agent binding
- **list**: `GET /list-phone-numbers` to show owned numbers
- **assign**: `PATCH /update-phone-number/{phone_number_id}` to bind agents
- **release**: `DELETE /delete-phone-number/{phone_number_id}`

**File**: `supabase/functions/manage-retell-numbers/index.ts` (new)

### 5. Update InboundNumbersPage to support Retell numbers
Add a provider toggle so users can purchase numbers from either Bland or Retell. When "Append" is selected, call `manage-retell-numbers` instead.

**File**: `src/pages/InboundNumbersPage.tsx`

### 6. Auto-assign outbound agent to Retell numbers
When an agent is saved with a Retell provider and outbound numbers exist, automatically call the Retell API to bind the agent as the `outbound_agent_id` on the number.

**File**: `supabase/functions/manage-retell-agent/index.ts` (extend update action)

## Technical Details

### manage-retell-agent -- enhanced create action
```text
1. POST /create-agent (existing)
2. Extract llm_id from response.response_engine.llm_id
3. If config.general_prompt provided:
   PATCH /update-retell-llm/{llm_id} with { general_prompt: config.general_prompt }
4. Return agent data with llm_id included
```

### tick-campaign -- Retell prompt injection (before batch)
```text
1. GET /get-agent/{retellAgentId} -> extract llm_id, check is_transfer_agent
2. Auto-fix transfer flags if needed (same as run-test-run)
3. Build taskPrompt via buildTaskPrompt(spec, [], knowledgeBriefing) + hipaaAppendix
4. PATCH /update-retell-llm/{llm_id} with { general_prompt: trimmedPrompt }
5. Proceed with existing batch call logic
```

### manage-retell-numbers -- new edge function
```text
Actions:
- "purchase": POST /create-phone-number { area_code, inbound_agent_id?, outbound_agent_id? }
  -> Save to outbound_numbers table with status "trusted"
- "list": GET /list-phone-numbers
  -> Return all Retell numbers
- "assign_agent": PATCH /update-phone-number/{id} { outbound_agent_id }
- "release": DELETE /delete-phone-number/{id}
  -> Update outbound_numbers status to "released"
```

### CreateAgentPage -- auto-create flow
```text
In handleSaveAgent, when voiceProvider === "retell" && !retellAgentId:
1. Build task prompt from current spec
2. Call manage-retell-agent { action: "create", config: { agent_name, voice_id, language, general_prompt } }
3. Set retellAgentId from response
4. Save to agent_specs as before
```

## Files Changed
- **Modified**: `supabase/functions/manage-retell-agent/index.ts` -- prompt injection on create, agent-number binding on update
- **Modified**: `supabase/functions/tick-campaign/index.ts` -- add Retell prompt injection + transfer agent fix before batch calls
- **Modified**: `src/pages/CreateAgentPage.tsx` -- auto-create Retell agent on save
- **New**: `supabase/functions/manage-retell-numbers/index.ts` -- Retell phone number CRUD
- **Modified**: `src/pages/InboundNumbersPage.tsx` -- provider toggle for number purchase

## Priority Order
1. tick-campaign prompt injection (critical -- production calls are silent)
2. Auto-create agent on save (UX improvement)
3. Prompt injection on create (ensures agent is ready immediately)
4. Retell number management (enables full self-service)
5. InboundNumbersPage provider toggle (UI for number management)

