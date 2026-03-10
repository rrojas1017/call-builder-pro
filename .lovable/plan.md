

## Make Agent Feedback Persist: Retell Resync + Fresh Prompt Rebuild

### Problem
When feedback updates `business_rules` in `agent_specs`, the changes don't reach the next call because:
1. `apply-audit-recommendation` never resyncs the Retell agent after patching the spec
2. `run-test-run` uses cached `agent_instructions_text` instead of rebuilding from the latest spec

### Changes

**1. `supabase/functions/apply-audit-recommendation/index.ts`** (after line 315, before the return)
- After recording the improvement, check if `spec.retell_agent_id` exists
- If so, rebuild the prompt via `buildTaskPrompt(spec_with_patch)` and call the Retell API to update the LLM's `general_prompt`
- This ensures live/test calls immediately use the updated business rules
- Import `buildTaskPrompt` from `../_shared/buildTaskPrompt.ts`

**2. `supabase/functions/run-test-run/index.ts`** (line 244)
- Change the prompt logic to always rebuild from the current spec: `buildTaskPrompt(spec, [], knowledgeBriefing, "")` 
- Only fall back to `agent_instructions_text` if spec is null (defensive)
- This ensures every test run picks up the latest feedback-driven spec changes

**3. Redeploy both edge functions** so the `business_rules` injection in `buildTaskPrompt.ts` is live.

