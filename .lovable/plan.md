

# Fix: "retell_agent_id not set on agent spec" for Appendify AI Educator

## Problem
Jason Fine's **"Appendify AI Educator"** agent (persona: Dex) was created but never provisioned with a telephony backend. It has `retell_agent_id = null` and `voice_id = null`. When he tries to run a test in University, `run-test-run` throws the error shown in the screenshot.

## Root Cause
The agent was likely created before the wizard auto-provisioning was added, or the provisioning step failed silently. All other agents in the org have valid retell_agent_ids.

## Fix (Two Parts)

### Part 1: Immediate — Provision the missing agent now
Invoke `bulk-sync-retell-agents` which already handles exactly this case: it finds `agent_specs` where `retell_agent_id IS NULL`, creates the LLM + agent on Retell, and updates the DB. This will provision "Appendify AI Educator" with a default voice since `voice_id` is null.

### Part 2: Preventive — Auto-provision in `run-test-run` when missing
Update `supabase/functions/run-test-run/index.ts` to detect when `retell_agent_id` is null and auto-provision via `manage-retell-agent` before proceeding, instead of throwing an error. This prevents future agents from hitting this wall.

**File: `supabase/functions/run-test-run/index.ts`** (~line 113-114)
- Replace the hard throw with a call to `manage-retell-agent` (action: "create") using the spec's voice/language/name
- Save the returned `agent_id` back to `agent_specs`
- Continue with the test run using the newly created agent

This is a ~15-line addition replacing the 1-line throw, using the same provisioning pattern as the creation wizard.

