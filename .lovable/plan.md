

# Fix: Bulk Sync Function Missing LLM Creation Step

## Problem

The `bulk-sync-retell-agents` function sends `response_engine: { type: "retell-llm" }` to Retell's Create Agent API **without** first creating a Retell LLM and passing its `llm_id`. Retell now requires one of `llm_id`, `llm_websocket_url`, or `conversation_flow_id` in the `response_engine` object.

All 6 unpaired agents failed with this error.

## Solution

Update the bulk sync function to match the pattern already used in `manage-retell-agent`:

1. **Create a Retell LLM first** (via `POST /create-retell-llm`) with the agent's prompt/description
2. **Pass the resulting `llm_id`** in the `response_engine` when creating the agent
3. **Add voice ID validation** using the same prefix-check logic (fallback to `11labs-Adrian` for legacy IDs like `maya` or raw UUIDs)

## Technical Details

Changes to `supabase/functions/bulk-sync-retell-agents/index.ts`:

- Before creating each Retell agent, call `POST /create-retell-llm` with `general_prompt` built from the project description and source text
- Pass `{ type: "retell-llm", llm_id: <new_llm_id> }` in the create-agent body
- Add the `isValidRetellVoiceId` helper (same as in `manage-retell-agent`) to validate voice IDs and default to `11labs-Adrian` for invalid ones
- Remove the separate "inject prompt into LLM" step (since the prompt is set during LLM creation)

## Expected Result

After this fix, re-running the bulk sync should successfully provision all 6 agents with green "synced" status.

