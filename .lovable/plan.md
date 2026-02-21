
# Remove Bland AI -- Migrate Everything to Retell

## Overview
Remove all Bland AI references, code paths, and edge functions from the entire codebase. Retell (branded as "Append" in the UI) becomes the sole telephony provider. The voice provider toggle in agent creation/editing is removed since there's only one option now.

## Scope Summary

**Edge Functions to DELETE entirely (4 functions):**
1. `supabase/functions/list-bland-voices/` -- no longer needed
2. `supabase/functions/generate-voice-sample/` -- uses Bland TTS API, Retell voices have hosted preview URLs instead
3. `supabase/functions/receive-bland-webhook/` -- replaced by `receive-retell-webhook`
4. `supabase/functions/live-call-stream/` -- the "transcript" and "listen" actions use Bland API; the "retell_transcript" action can be kept but simplified

**Edge Functions to MODIFY (remove Bland branches):**
5. `supabase/functions/run-test-run/index.ts` -- remove entire Bland branch (lines 267-370), remove `BLAND_API_KEY` requirement, make Retell the only path
6. `supabase/functions/tick-campaign/index.ts` -- remove entire Bland branch (lines 288-425), remove `BLAND_API_KEY` requirement, remove `webhookUrl` for Bland, make Retell the only path
7. `supabase/functions/stop-call/index.ts` -- remove Bland branch, keep only Retell stop logic, default provider to "retell"
8. `supabase/functions/manage-inbound-numbers/index.ts` -- remove Bland purchase, assign, unassign, sync actions; all actions now go through Retell (via `manage-retell-numbers`). Simplify to only handle Retell numbers
9. `supabase/functions/live-call-stream/index.ts` -- remove Bland "transcript" and "listen" actions, keep only "retell_transcript" (renamed to just "transcript")

**Frontend Files to MODIFY:**
10. `src/pages/CreateAgentPage.tsx` -- remove `useBlandVoices` import, remove voice provider toggle (default to "retell"), remove "Voz" option, remove `backgroundTrack` state (Bland-only feature), always use Retell voices
11. `src/pages/EditAgentPage.tsx` -- same as above: remove Bland voices, provider toggle, background audio section
12. `src/pages/InboundNumbersPage.tsx` -- remove provider toggle in purchase dialog (always Retell), remove Bland purchase path, always call `manage-retell-numbers` for purchase
13. `src/components/LiveCallMonitor.tsx` -- remove Bland polling/listen logic, keep only Retell transcript polling
14. `src/components/VoiceSelector.tsx` -- update to use Retell voice type instead of `BlandVoice`
15. `src/components/VoicePlayButton.tsx` -- remove Bland TTS fallback, use only Retell preview URLs
16. `src/pages/UniversityPage.tsx` -- remove `bland_call_id` references, use `retell_call_id` only
17. `src/pages/CallsPage.tsx` -- remove `bland_call_id` from interface
18. `src/pages/CampaignDetailPage.tsx` -- remove `bland_call_id` references

**Frontend Files to DELETE:**
19. `src/hooks/useBlandVoices.ts` -- no longer needed

**Config to UPDATE:**
20. `supabase/config.toml` -- remove entries for deleted functions (`list-bland-voices`, `generate-voice-sample`, `receive-bland-webhook`)

## Important Notes

**Database columns are NOT removed** -- columns like `bland_call_id`, `bland_batch_id` on tables `calls`, `contacts`, `campaigns`, `test_run_contacts` will remain in the database to preserve historical data. They simply won't be written to anymore. The `voice_provider` column on `agent_specs` will default to `'retell'` for all new records. No schema migration is needed.

**The `receive-retell-webhook` function already exists** and handles the same flows (test lab, campaign, inbound) that `receive-bland-webhook` handled. No duplication needed.

**The `manage-retell-numbers` function already exists** and handles purchase, list, assign_agent, and release for Retell numbers. The `manage-inbound-numbers` function's purchase action can be removed since purchasing now always goes through `manage-retell-numbers`.

## Technical Details by File

### Edge Functions

**`run-test-run/index.ts`:**
- Remove line 19-20 (`BLAND_API_KEY` requirement)
- Remove the `if (voiceProvider === "retell")` condition -- make the Retell branch the only code path
- Delete lines 267-370 (entire Bland branch)
- Remove `voiceProvider` variable -- always use Retell

**`tick-campaign/index.ts`:**
- Remove line 17-18 (`BLAND_API_KEY` requirement)
- Remove line 156 (`webhookUrl` for Bland)
- Remove the `if (voiceProvider === "retell")` condition -- make the Retell branch the only code path
- Delete lines 288-425 (entire Bland branch including batch API call and call ID resolution)

**`stop-call/index.ts`:**
- Remove the Bland branch (lines 36-53)
- Default to Retell, remove provider parameter logic
- Keep only the Retell stop call logic

**`manage-inbound-numbers/index.ts`:**
- Remove "purchase" action (Bland purchase) -- purchases now go through `manage-retell-numbers`
- In "assign" action: remove `isRetell` check and Bland flow -- always use Retell assign
- In "unassign" action: remove Bland flow -- always use Retell unassign
- Remove "sync" action (Bland-specific)
- Remove `BLAND_API_KEY` references
- Keep: assign (Retell only), unassign (Retell only), release, update_label

**`live-call-stream/index.ts`:**
- Remove `BLAND_API_KEY` requirement
- Remove "transcript" action (Bland)
- Remove "listen" action (Bland WebSocket)
- Rename "retell_transcript" to "transcript"
- This becomes a Retell-only transcript fetcher

### Frontend

**`CreateAgentPage.tsx`:**
- Remove `useBlandVoices` import and usage
- Use `useRetellVoices` instead (already imported indirectly via VoiceSelector)
- Remove `voiceProvider` state -- hardcode to "retell"
- Remove voice provider toggle UI (the two-button grid)
- Remove `backgroundTrack` state and related UI
- Always pass `voice_provider: "retell"` when saving spec

**`EditAgentPage.tsx`:**
- Remove `useBlandVoices` import
- Remove `voiceProvider` state and toggle UI
- Remove Background Audio section (lines 289-330)
- Always use Retell voices
- Always save `voice_provider: "retell"`

**`InboundNumbersPage.tsx`:**
- Remove `provider` state
- Remove the two-button provider toggle in purchase dialog
- Always call `manage-retell-numbers` for purchase
- Update cost text to always show "$2.00"

**`LiveCallMonitor.tsx`:**
- Remove `blandCallId` prop
- Remove `isBland` logic
- Remove Bland transcript polling effect
- Remove "listen" (WebSocket) functionality (Bland-only)
- Keep only Retell transcript polling via DB or edge function

**`VoiceSelector.tsx`:**
- Rename `BlandVoice` type reference to a generic `Voice` type (or use Retell voice type)

**`VoicePlayButton.tsx`:**
- Remove the Bland TTS fallback (generate-voice-sample call)
- Only use `previewUrl` from Retell voices

## Execution Order
1. Delete Bland-only edge functions and remove from config.toml
2. Modify remaining edge functions to remove Bland branches
3. Delete `useBlandVoices.ts` hook
4. Update frontend pages and components
5. Deploy modified edge functions
