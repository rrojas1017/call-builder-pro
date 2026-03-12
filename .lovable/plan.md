
Issue reframe:
- The current player is still failing because it’s trying `recording.mp3` first, and your provider URLs are returning `403 AccessDenied` for MP3.
- I verified this in network logs: repeated requests to `.../recording.mp3` return 403, and the browser never attempts WAV in the current flow.
- For your exact 15-minute call, both direct URL access and provider lookup now fail (`AccessDenied` + provider `404` for that call ID), which means that specific recording is likely no longer retrievable from the provider.

Do I know what the issue is?
- Yes:
  1) Playback logic is biased to MP3 URLs that are not available in this environment.
  2) Some older/cancelled calls were likely removed upstream, so their recording URLs are permanently invalid.
  3) The stop-call backend currently has a delete fallback that can remove provider call artifacts, making future playback impossible for some calls.

Implementation plan:

1) Fix playback order and fallback behavior in `SmartAudioPlayer`
- File: `src/components/SmartAudioPlayer.tsx`
- Change source strategy from “MP3 first” to a controlled candidate list with WAV first.
- On error, step through candidates explicitly (`wav -> mp3 -> blob attempts`) instead of relying on browser `<source>` fallback.
- Update “Play in New Tab” to open the best surviving URL (not MP3-only).
- Keep retry functional and clean up object URLs properly.

2) Make download resilient to MP3-unavailable environments
- File: `src/lib/recordingDownload.ts`
- Attempt MP3 download first, then WAV if MP3 is denied.
- Ensure filename/extension matches actual downloaded format.
- Final fallback opens playable URL in a new tab.

3) Add provider-side recording status check when playback fails
- Files:
  - `supabase/functions/live-call-stream/index.ts`
  - `src/components/SmartAudioPlayer.tsx`
- Extend `live-call-stream` with a `recording_status` action returning:
  - `exists`, `recording_url`, `public_log_url`, `opt_in_signed_url`, `call_status`.
- In player: if local URL fails, call this action using `retell_call_id`; retry with fresh URL if returned.
- If provider returns not found, show explicit “Recording no longer available” message.

4) Pass call IDs into the player where needed
- Files:
  - `src/pages/UniversityPage.tsx`
  - `src/pages/CallsPage.tsx`
  - `src/components/TestResultsModal.tsx`
  - (optionally) `src/pages/CampaignDetailPage.tsx`
- Add `retellCallId` prop so player can request fresh recording metadata after failure.

5) Prevent future recording loss on manual stop
- File: `supabase/functions/stop-call/index.ts`
- Remove destructive `delete-call` fallback.
- If `end-call` returns 404, treat as already ended (non-destructive success path).
- This prevents future calls from becoming unrecoverable after stop actions.

Technical details (why this fixes it):
- Browser behavior with first playable MIME + HTTP 403 can block practical fallback when MP3 is first.
- Your environment shows MP3 URLs consistently denied; WAV is the reliable primary source when available.
- Some calls are truly gone at provider level; only a provider status check can distinguish “temporary load issue” vs “permanently unavailable.”
- Removing delete fallback preserves provider-side recordings for future sessions.

Validation checklist after implementation:
1. Test an active/recent completed call: player should request WAV first and play.
2. Test the problematic 15-min call: UI should show a clear “recording unavailable” state (not silent 0:00).
3. Test stop-call flow end-to-end: stopping a call should not make the recording disappear afterward.
