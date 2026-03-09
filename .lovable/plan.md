

# Simplify the Agent Creation Wizard

## Problem Analysis
After reviewing Jason Fine's data and the full wizard code, the good news is all 8 of his agents *did* eventually get provisioned with Retell IDs. The original failure (Appendify AI Educator missing `retell_agent_id`) was already patched with our auto-provisioning guard.

However, the wizard UX has several friction points that make it confusing for non-technical users:

1. **Step 3 (Review & Save) is overwhelming** — it shows 7+ configuration sections (Agent Mode, Voice Provider with RetellAgentManager, Call Ending, Voice Selection, raw spec editor) all at once. Users like Jason likely don't know what "Voice Provider" or "Append Agent" means.

2. **RetellAgentManager is exposed to end users** — it shows "Create Append Agent" button, agent IDs, webhook status, transfer agent warnings. This is internal plumbing that should be invisible.

3. **Voice selection is disconnected from provisioning** — user picks a voice but then also sees a separate "Voice Provider" card asking them to create/connect an agent. These should be unified.

4. **No progress feedback during save** — the `handleSaveAgent` does multiple async steps (create Retell agent, guard opening line, update DB) with no step-by-step feedback. If any step fails silently (like the Retell creation try/catch on line 444-447), the agent is saved without provisioning and the user gets no clear indication.

5. **Error on Retell creation is swallowed** — line 444-447 catches the error, shows a toast, but **continues saving the agent anyway** with `finalRetellAgentId` still empty. This is how agents end up with `null` retell_agent_id.

## Plan

### 1. Hide RetellAgentManager from the wizard (remove from Step 3)
Remove the entire "Voice Provider" card (lines 742-763) from `CreateAgentPage.tsx`. The Retell agent should be created automatically and silently — users should never see agent IDs, webhook status, or "Create Append Agent" buttons during creation.

### 2. Fix silent failure: block save if Retell provisioning fails
In `handleSaveAgent` (line 408), change the try/catch around auto-creation (lines 424-448) so that if Retell creation fails, the save is **aborted** with a clear error message instead of continuing with a null `retell_agent_id`.

### 3. Add step-by-step save progress
Replace the single "Save Agent" button with a multi-phase save that shows progress:
- Phase 1: "Setting up voice..." (Retell agent creation)
- Phase 2: "Saving configuration..." (DB update)
- Phase 3: "Done!" → redirect

Show these phases inline using the existing `saving` state plus a new `savePhase` state string.

### 4. Consolidate Step 3 layout
Reorder the Review & Save step to be more logical and less overwhelming:
1. Summary cards (what the agent does) — already good
2. Voice Selection (pick a voice)
3. Call Ending (end or transfer)
4. Agent Mode (outbound/inbound/hybrid) — collapse into a simple toggle since most users want outbound
5. Remove raw spec editor button from default view (keep for power users via a smaller "Advanced" collapsible)

### Files Changed
- **`src/pages/CreateAgentPage.tsx`** — Remove RetellAgentManager from wizard, fix error handling in `handleSaveAgent`, add save progress, reorder Step 3 sections

No database or edge function changes needed.

