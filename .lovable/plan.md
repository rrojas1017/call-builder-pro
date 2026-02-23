

# Clean Up Retell Agent Sprawl and Keep Them in Sync

## Problem

Your database tracks 6 agents with correct voice assignments (cartesia-Sofia, minimax-Ashley, etc.), but the Retell dashboard shows 12+ agents -- most using the default "Adrian" voice. This happens because:

1. Agent creation never checks if an orphan already exists -- it always creates new ones
2. Deleted or recreated agents in your app leave behind orphan agents in Retell
3. The default voice fallback is "Adrian", so orphaned agents all show Adrian
4. The bulk-sync function creates new agents for any spec missing a `retell_agent_id`, even if a previous one existed

## Solution (3 parts)

### Part 1: Add a cleanup utility edge function

Create a new `cleanup-retell-agents` edge function that:
- Lists all agents from Retell API (`GET /list-agents`)
- Compares against `retell_agent_id` values in your `agent_specs` table
- Identifies orphans (Retell agents not referenced by any DB record)
- Supports dry-run mode (list orphans) and delete mode (remove them)

### Part 2: Prevent future orphans in manage-retell-agent

When the "create" action is called:
- Before creating, check if the spec already has a `retell_agent_id` and if that agent still exists in Retell
- If it exists, update it instead of creating a new one
- Only create a new agent if there truly is no existing one

### Part 3: Sync voice on creation (not just pre-flight)

Update `manage-retell-agent` and `bulk-sync-retell-agents` to:
- Always pass the voice_id directly from the spec without prefix validation (matching the existing sync strategy)
- Remove the `isValidRetellVoiceId` check that forces fallback to Adrian

## Technical Details

### New file: `supabase/functions/cleanup-retell-agents/index.ts`

```text
- GET /list-agents from Retell API
- SELECT retell_agent_id FROM agent_specs WHERE retell_agent_id IS NOT NULL
- Compute orphans = retell_agents - db_agents
- If mode=delete: DELETE each orphan via Retell API
- Return { orphans_found, deleted, kept }
```

### Modified: `supabase/functions/manage-retell-agent/index.ts`

- In the "create" action, skip creation if the config already contains a valid `agent_id` that exists in Retell -- update instead

### Modified: `supabase/functions/bulk-sync-retell-agents/index.ts`

- Remove `isValidRetellVoiceId` fallback to Adrian (line 94)
- Pass `spec.voice_id` directly, letting Retell validate it
- This matches the existing voice sync strategy used in `run-test-run`

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/cleanup-retell-agents/index.ts` | New -- orphan detection and cleanup |
| `supabase/functions/manage-retell-agent/index.ts` | Prevent duplicate creation; remove Adrian fallback |
| `supabase/functions/bulk-sync-retell-agents/index.ts` | Remove `isValidRetellVoiceId` fallback to Adrian |

## Immediate Action

After deploying, you can run the cleanup function in dry-run mode first to see which agents are orphans, then run it in delete mode to clean up the Retell dashboard.

