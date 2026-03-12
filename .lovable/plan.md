

# Server-Side Recording Download Proxy

## Problem
The recording URLs from the CDN return `403 AccessDenied` when accessed from the browser (both for `<audio>` playback and `fetch()`). The specific 15-minute Appendify Educator recording (`call_5d862fd88f63d6a8c44ead73a29`) is confirmed gone from the provider entirely — it cannot be recovered. However, for recordings that DO still exist at the CDN but are blocked by CORS/access policies, browser-side fetching will never work. We need a server-side proxy.

## Plan

### 1. Create `download-recording` edge function
**File:** `supabase/functions/download-recording/index.ts`

A new backend function that:
- Accepts `{ recording_url, retell_call_id }` in the request body
- Fetches the WAV (then MP3 fallback) **server-side** — no CORS restrictions
- If the stored URL fails and `retell_call_id` is provided, looks up a fresh URL from the provider API
- Streams the audio bytes back to the client with proper `Content-Disposition: attachment` header
- Authenticated via the existing `requireAuth` pattern

### 2. Update `SmartAudioPlayer` to use proxy for playback and download
**File:** `src/components/SmartAudioPlayer.tsx`

- In the `handleError` fallback chain, after direct fetch fails, call the new edge function to get the audio as a blob via the server-side proxy
- Update the "Download" button in the failed state to also use the proxy
- Keep the "unavailable" state for truly deleted recordings

### 3. Update `downloadRecording` utility to use proxy
**File:** `src/lib/recordingDownload.ts`

- After direct WAV/MP3 fetch fails, attempt download via the edge function proxy before falling back to opening in new tab

### 4. Update download buttons across pages
**Files:** `src/pages/CallsPage.tsx`, `src/components/TestResultsModal.tsx`, `src/pages/CampaignDetailPage.tsx`

- Pass `retellCallId` to the download function so the proxy can look up fresh URLs if needed

**Note:** The specific 15-minute recording from last night is permanently unavailable from the provider. This fix ensures future recordings can always be downloaded even when the CDN blocks browser access.

