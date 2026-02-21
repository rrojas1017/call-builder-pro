

# Bring Retell (Append) to Feature Parity with Bland

## Overview

This plan adds three missing capabilities to the Retell (Append) provider so it matches what Bland (Voz) already offers:

1. **Voice preview samples** -- Retell voices include a `preview_audio_url` in their API response. We just need to surface it.
2. **Live transcript polling during calls** -- Retell's Get Call API (`/v2/get-call/{call_id}`) returns a live transcript. We'll poll it the same way we poll Bland.
3. **Batch campaign dialing** -- Retell has a `/create-batch-call` API. We'll use it in `tick-campaign` instead of dialing one-by-one.

---

## Feature 1: Voice Preview Samples for Retell

**How it works today (Bland only):**
- `VoicePlayButton` calls `generate-voice-sample` edge function, which hits Bland's TTS API and returns audio
- `VoiceSelector` renders a `VoicePlayButton` for every voice card

**How Retell voices work:**
- Retell's `/list-voices` API returns a `preview_audio_url` field (e.g. `https://retell-utils-public.s3.us-west-2.amazonaws.com/adrian.mp3`) for each voice
- No TTS generation needed -- we just play the URL directly

**Changes:**

| File | Change |
|------|--------|
| `supabase/functions/list-retell-voices/index.ts` | **New edge function.** Calls `GET https://api.retellai.com/list-voices` with RETELL_API_KEY. Returns the voice list with `preview_audio_url` included. |
| `supabase/config.toml` | Add `[functions.list-retell-voices]` with `verify_jwt = false` |
| `src/hooks/useRetellVoices.ts` | **New hook.** Mirrors `useBlandVoices` but calls `list-retell-voices`. Maps Retell fields (voice_id, voice_name, gender, language, accent, preview_audio_url) to the same `BlandVoice` interface plus an optional `preview_url` field. |
| `src/hooks/useBlandVoices.ts` | Add optional `preview_url?: string` to `BlandVoice` interface |
| `src/components/VoicePlayButton.tsx` | Accept optional `previewUrl` prop. When present, skip the edge function call and just play the URL directly via `new Audio(previewUrl)`. Falls back to existing generate-voice-sample logic when no previewUrl. |
| `src/components/VoiceSelector.tsx` | Pass `voice.preview_url` to `VoicePlayButton` so Retell voices play their hosted sample. |
| `src/pages/EditAgentPage.tsx` | When `voiceProvider === "retell"`, use `useRetellVoices()` instead of `useBlandVoices()` for the voice selector. |

---

## Feature 2: Live Transcript Polling for Retell Calls

**How it works today:**
- For Bland: `LiveCallMonitor` polls the `live-call-stream` edge function which calls `GET /v1/calls/{call_id}` to get transcripts
- For Retell: `LiveCallMonitor` polls `test_run_contacts.transcript` from the database, which only updates after the call ends (via webhook)

**How Retell can do it:**
- Retell's Get Call API (`GET /v2/get-call/{call_id}`) returns a `transcript` field that updates in real-time during the call
- We add a `retell` action to the `live-call-stream` edge function (or create a new one) that proxies this API

**Changes:**

| File | Change |
|------|--------|
| `supabase/functions/live-call-stream/index.ts` | Add a new action `"retell_transcript"`. When received, call `GET https://api.retellai.com/v2/get-call/{call_id}` with RETELL_API_KEY. Parse the transcript string (format: `"Agent: hi\nUser: hello"`) into the same `{id, role, text}` array format. Return it. |
| `src/components/LiveCallMonitor.tsx` | For Retell calls: instead of polling the database, poll the `live-call-stream` edge function with `action: "retell_transcript"` and the retell call ID. Same 1.5s interval as Bland. Remove the old database-polling path for Retell. |

---

## Feature 3: Batch Campaign Dialing for Retell

**How it works today:**
- Bland campaigns: `tick-campaign` uses the V2 Batch API (`POST /v2/batches/create`) with `global` settings and `call_objects` array -- dispatches all contacts in one API call
- Retell campaigns: `tick-campaign` loops through contacts one-by-one with `POST /v2/create-phone-call`

**How Retell batch works:**
- Retell has `POST /create-batch-call` API
- Requires: `from_number`, `tasks` array (each task has `to_number` and optional dynamic variables/metadata)
- The agent_id is tied to the from_number binding in Retell's system

**Changes:**

| File | Change |
|------|--------|
| `supabase/functions/tick-campaign/index.ts` | Replace the one-by-one Retell loop with a single `POST https://api.retellai.com/create-batch-call` request. Build the `tasks` array from contacts (each with `to_number` and `metadata`). Set `from_number` from spec or trusted pool. After batch creation, update all contacts to `status: "calling"`. |

**Note:** Retell's batch API requires the agent to be bound to the `from_number` in Retell's dashboard. The webhook (`receive-retell-webhook`) already handles campaign flow correctly -- no changes needed there.

---

## Summary of All Changes

| File | Type | Description |
|------|------|-------------|
| `supabase/functions/list-retell-voices/index.ts` | New | Edge function to list Retell voices |
| `supabase/config.toml` | Config | Add list-retell-voices entry |
| `src/hooks/useRetellVoices.ts` | New | Hook to fetch Retell voices |
| `src/hooks/useBlandVoices.ts` | Edit | Add `preview_url` to interface |
| `src/components/VoicePlayButton.tsx` | Edit | Support direct URL playback |
| `src/components/VoiceSelector.tsx` | Edit | Pass preview_url through |
| `src/pages/EditAgentPage.tsx` | Edit | Switch voice hook based on provider |
| `supabase/functions/live-call-stream/index.ts` | Edit | Add retell_transcript action |
| `src/components/LiveCallMonitor.tsx` | Edit | Poll Retell transcripts via edge function |
| `supabase/functions/tick-campaign/index.ts` | Edit | Use Retell batch API for campaigns |

No database changes required. No new secrets needed (RETELL_API_KEY is already configured).

