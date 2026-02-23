

# Fix: Add Background Noise and Reduce Echo for ACA Agent

## Problem
1. **No background noise**: The agent sounds sterile because `ambient_sound` is never set. The backend (`manage-retell-agent`) already supports it, but there's no UI to configure it and the database field (`background_track`) is always saved as `null`.
2. **Echo on calls**: Likely caused by the voice or audio pipeline configuration. Retell supports `voice_temperature` tuning and responsiveness settings that can help reduce echo artifacts.

## Solution

### 1. Add "Ambient Sound" selector to Edit Agent page
Add a dropdown in `src/pages/EditAgentPage.tsx` under the Voice section with Retell's supported ambient sounds:
- None (default)
- Coffee Shop
- Convention Hall
- Summer Outdoor
- Mountain Outdoor
- Static Noise
- Call Center

This maps directly to Retell's `ambient_sound` parameter which is already wired up in the `manage-retell-agent` function.

### 2. Save ambient sound to the database
- Load the `background_track` field from `agent_specs` (already fetched but unused)
- Save the selected ambient sound value to the `background_track` column on save
- Pass it through to the Retell agent when creating/updating

### 3. Wire ambient sound through agent sync flows
Update `run-test-run` and `tick-campaign` (the functions that sync agent config before calls) to include the `ambient_sound` value from the spec when patching the Retell agent.

### 4. Address echo
- Set a default `ambient_sound` of `"coffee-shop"` for the ACA agent specifically (this naturally masks minor echo)
- Ensure `responsiveness` is set to a balanced value (0.5-0.7) which helps with audio timing and reduces perceived echo

### Files Changed

| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Add ambient sound dropdown UI, load/save the value |
| `src/pages/CreateAgentPage.tsx` | Add ambient sound dropdown to agent creation flow |
| `supabase/functions/run-test-run/index.ts` | Pass `ambient_sound` from spec when syncing agent |
| `supabase/functions/tick-campaign/index.ts` | Pass `ambient_sound` from spec when syncing agent |

