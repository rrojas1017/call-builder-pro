
# Fix: Retell Agent Not Following System Instructions

## Problem
The Retell branch in the `run-test-run` edge function only sends `override_agent_id`, `to_number`, and `from_number` when creating a call. Unlike Bland (where the full prompt is passed per-call via the `task` field), **Retell stores its prompt on the LLM** attached to the agent. Currently, the agent's LLM has no custom prompt set -- it uses Retell's bare default, which is why the call ignored your script entirely.

## Solution
Before initiating Retell calls, update the agent's LLM with the full task prompt built from `buildTaskPrompt`. Also pass per-contact dynamic variables (like the caller's name) via `retell_llm_dynamic_variables` on each call.

## Changes

### 1. Update `run-test-run` edge function (Retell branch)

**Before the per-contact loop**, after loading the spec and building the knowledge briefing:
- Fetch the Retell agent to get its `llm_id`
- Build the task prompt using `buildTaskPrompt()` (same as the Bland branch)
- `PATCH /update-retell-llm/{llm_id}` with `{ general_prompt: taskPrompt }` to inject the system instructions into the agent's LLM

**Inside the per-contact loop**, for each call:
- Add `retell_llm_dynamic_variables` to the call payload with per-contact data (e.g., `first_name`, `agent_name`) so template variables resolve correctly
- If `agent_instructions_text` is set on the test run (custom override), use that as the prompt instead of the generated one

### 2. Update `manage-retell-agent` -- set prompt on create

When creating a new Retell agent, if an LLM is auto-created, optionally set an initial `general_prompt` so it's not blank. This is a minor improvement since `run-test-run` will update it before calls anyway.

### 3. No UI changes needed

## Technical Details

```text
Flow (Retell branch in run-test-run):

1. Load spec, knowledge, build taskPrompt via buildTaskPrompt()
2. GET /get-agent/{retellAgentId} -> extract llm_id
3. PATCH /update-retell-llm/{llm_id} with { general_prompt: taskPrompt }
4. For each contact:
   a. Build retellPayload (existing logic)
   b. Add retell_llm_dynamic_variables: { first_name, agent_name }
   c. POST /v2/create-phone-call (existing retry logic)
```

The prompt update happens once per test run (not per contact), keeping API calls minimal. Per-contact personalization uses dynamic variables.

If the test run has `agent_instructions_text` (custom instructions override), that text is used as the `general_prompt` instead of the auto-built prompt.

## Files Changed
- **Modified**: `supabase/functions/run-test-run/index.ts` -- add LLM prompt injection before Retell calls, add `retell_llm_dynamic_variables` per contact
