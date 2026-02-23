

# Bulk Voice Sync: Fix Adrian Fallback on Existing Retell Agents

## Problem

After the orphan cleanup, the 6 remaining agents in Retell are the correct ones tracked in the database. However, 3 of them still show "Adrian" as their voice because they were created before the voice-sync fix was applied. The cleanup only deleted orphans -- it did not re-sync the voice profiles on the surviving agents.

Additionally, `manage-retell-agent` line 45 still has a hardcoded `"11labs-Adrian"` fallback that should be removed to prevent this from recurring.

## Solution

### 1. Create a `bulk-sync-voices` edge function

A one-shot utility that:
- Loads all `agent_specs` rows that have a `retell_agent_id` and a `voice_id`
- For each one, PATCHes the Retell agent with the correct `voice_id` from the database
- Returns a summary of what was synced

### 2. Remove the Adrian fallback in `manage-retell-agent`

Change line 45 from:
```
const voiceId = config.voice_id || "11labs-Adrian";
```
to:
```
const voiceId = config.voice_id;
```
If no voice is provided, let Retell use its own default rather than forcing Adrian.

### 3. Run the sync

After deploying, invoke the bulk-sync-voices function to patch all 6 agents with their correct voice IDs from the database.

## Technical Details

### New file: `supabase/functions/bulk-sync-voices/index.ts`

```text
- SELECT id, retell_agent_id, voice_id, persona_name FROM agent_specs
    JOIN agent_projects ON ... (for name)
    WHERE retell_agent_id IS NOT NULL
- For each spec:
    PATCH https://api.retellai.com/update-agent/{retell_agent_id}
    body: { voice_id: spec.voice_id }
- Return results array with agent name, old voice (from GET), new voice, status
```

### Modified file: `supabase/functions/manage-retell-agent/index.ts`

- Line 45: Remove `|| "11labs-Adrian"` fallback so voice_id passes through as-is

## Expected Result

After running the sync:
- Sofia will show "Sofia" (already correct)
- Both Alex agents will show "Ashley" 
- ACA Inbound will show "Ashley"
- Angel will show "Summer" (already correct)
- home services will use its assigned custom voice UUID

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/bulk-sync-voices/index.ts` | New -- patches all Retell agents with correct voice_id from DB |
| `supabase/functions/manage-retell-agent/index.ts` | Remove Adrian fallback on line 45 |

