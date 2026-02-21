

# Migration: Remove Bland AI, Make Retell the Sole Provider

## Overview
Remove all Bland AI integration and make Retell (Append) the only telephony provider. This simplifies the codebase by eliminating dual-provider branching, removing the Bland API dependency, and defaulting everything to Retell.

## Scope of Changes

### Edge Functions to DELETE (3 functions)
These are Bland-only and have no Retell equivalent needed:
- `supabase/functions/list-bland-voices/` -- replaced by `list-retell-voices`
- `supabase/functions/receive-bland-webhook/` -- replaced by `receive-retell-webhook`
- `supabase/functions/manage-inbound-numbers/` -- replaced by `manage-retell-numbers`

### Edge Functions to MODIFY (5 functions)

1. **`run-test-run/index.ts`** -- Remove the entire Bland branch (lines ~268-380). Keep only the Retell branch. Remove `BLAND_API_KEY` dependency.

2. **`tick-campaign/index.ts`** -- Remove the entire Bland branch (lines ~288-425). Keep only the Retell branch. Remove `BLAND_API_KEY` dependency. Remove `webhookUrl` for Bland webhook.

3. **`stop-call/index.ts`** -- Remove the Bland branch (lines 36-54). Keep only Retell logic. Remove `BLAND_API_KEY` dependency.

4. **`live-call-stream/index.ts`** -- Remove the Bland "transcript" action (lines 32-67) and "listen" action (lines 131-162). Keep only the `retell_transcript` action, rename it to just `transcript`. Remove `BLAND_API_KEY` dependency.

5. **`generate-voice-sample/index.ts`** -- Rewrite to use Retell's voice sample API instead of Bland's. If Retell doesn't have a TTS sample endpoint, voices already have `preview_url` from the Retell API, so this function may just proxy that.

### Frontend Files to MODIFY (6 files)

1. **`src/hooks/useBlandVoices.ts`** -- DELETE this file entirely. The `BlandVoice` interface will be moved to/renamed in `useRetellVoices.ts`.

2. **`src/hooks/useRetellVoices.ts`** -- Rename the exported interface from `BlandVoice` to `Voice`. This becomes the sole voice hook.

3. **`src/components/VoiceSelector.tsx`** -- Update import from `BlandVoice` to `Voice` from `useRetellVoices`.

4. **`src/pages/CreateAgentPage.tsx`** -- Remove `useBlandVoices` import. Use only `useRetellVoices`. Remove the provider toggle (Voz/Append buttons). Remove "Bland only" conditional sections (background audio, voice selection guards). Default `voiceProvider` to `"retell"`. Auto-create Retell agent on save (already partially implemented).

5. **`src/pages/EditAgentPage.tsx`** -- Same changes as CreateAgentPage: remove `useBlandVoices`, remove provider toggle, default to retell, remove Bland-only sections.

6. **`src/pages/InboundNumbersPage.tsx`** -- Remove the provider toggle. Default to Retell numbers only. Call `manage-retell-numbers` instead of `manage-inbound-numbers`. Remove Bland sync button.

7. **`src/pages/AgentsPage.tsx`** -- Remove `voice_provider` type union and display logic referencing "bland".

8. **`src/components/VoicePlayButton.tsx`** -- Update to always use Retell preview URLs (the `preview_url` field) rather than falling back to the Bland `generate-voice-sample` function.

9. **`src/components/LiveCallMonitor.tsx`** -- Update to always use `retell_transcript` action (or renamed `transcript`) instead of checking for Bland call IDs.

10. **`src/components/TestLabSection.tsx`** -- Remove any Bland-specific call ID handling.

### Database Considerations
- The `agent_specs` table has `voice_provider` column defaulting to `'bland'`. We need a migration to change the default to `'retell'` and update all existing rows.
- The `calls` table has `bland_call_id` and `voice_provider` columns. Keep `bland_call_id` for historical data but change default `voice_provider` to `'retell'`.
- The `test_run_contacts` table has `bland_call_id`. Keep for historical data.
- The `contacts` table has `bland_call_id`. Keep for historical data.

### Database Migration
```sql
-- Change defaults to retell
ALTER TABLE agent_specs ALTER COLUMN voice_provider SET DEFAULT 'retell';
ALTER TABLE calls ALTER COLUMN voice_provider SET DEFAULT 'retell';

-- Update existing specs still set to bland
UPDATE agent_specs SET voice_provider = 'retell' WHERE voice_provider = 'bland';
UPDATE calls SET voice_provider = 'retell' WHERE voice_provider = 'bland';
```

## Implementation Order

1. **Database migration** -- change defaults and update existing records
2. **Delete Bland-only edge functions** -- `list-bland-voices`, `receive-bland-webhook`, `manage-inbound-numbers`
3. **Modify edge functions** -- strip Bland branches from `run-test-run`, `tick-campaign`, `stop-call`, `live-call-stream`, `generate-voice-sample`
4. **Rename voice interface** -- update `useRetellVoices` to export `Voice` instead of `BlandVoice`
5. **Delete `useBlandVoices.ts`**
6. **Update all frontend pages** -- remove provider toggles, Bland imports, and conditional sections
7. **Deploy edge functions**

## What This Preserves
- All Retell functionality (agent creation, prompt injection, batch calls, webhooks, number management)
- Historical call data with `bland_call_id` columns (not dropped, just no longer written to)
- The `BLAND_API_KEY` secret can remain in the vault without harm but will no longer be referenced

## Files Summary
- **Delete**: `src/hooks/useBlandVoices.ts`, `supabase/functions/list-bland-voices/`, `supabase/functions/receive-bland-webhook/`, `supabase/functions/manage-inbound-numbers/`
- **Modify**: `supabase/functions/run-test-run/index.ts`, `supabase/functions/tick-campaign/index.ts`, `supabase/functions/stop-call/index.ts`, `supabase/functions/live-call-stream/index.ts`, `supabase/functions/generate-voice-sample/index.ts`, `src/hooks/useRetellVoices.ts`, `src/components/VoiceSelector.tsx`, `src/components/VoicePlayButton.tsx`, `src/components/LiveCallMonitor.tsx`, `src/components/TestLabSection.tsx`, `src/pages/CreateAgentPage.tsx`, `src/pages/EditAgentPage.tsx`, `src/pages/InboundNumbersPage.tsx`, `src/pages/AgentsPage.tsx`

