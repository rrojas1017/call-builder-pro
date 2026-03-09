

# Add Compressed Recording Download (MP3)

## Problem
Retell recording URLs serve WAV files which are very large. Users want to download recordings but WAV files are impractical (a 5-minute call can be 50MB+ in WAV vs ~5MB in MP3).

## Solution
Create a backend function that fetches the WAV from Retell, converts it to MP3 using FFmpeg (available in Deno), and returns it. Add a download button next to the audio player in the Calls page, University test results modal, and Campaign detail page.

## Changes

### 1. New Edge Function: `convert-recording`
- Accepts `{ recording_url: string }` 
- Fetches the WAV from Retell
- Converts to MP3 using FFmpeg (via Deno subprocess or a WebAssembly-based encoder)
- Returns the MP3 binary as a downloadable response with `Content-Disposition: attachment`

**Alternative (simpler):** Since Retell actually serves recordings in both WAV and MP3 formats — the URL just needs `.mp3` appended or the format parameter changed — we should first check if Retell's API already provides an MP3 URL. If so, no edge function needed; just use the MP3 URL for downloads.

### 2. UI: Add Download Button
Add a download button in three locations:

- **`src/pages/CallsPage.tsx`** — next to the speed controls in the recording section
- **`src/components/TestResultsModal.tsx`** — next to the audio player  
- **`src/pages/CampaignDetailPage.tsx`** — next to the "Listen to Recording" link

The button will either:
- Link directly to Retell's MP3 variant URL (if available), or
- Call the `convert-recording` edge function and trigger a browser download

### Approach Decision
Retell's `recording_url` typically ends in `.wav`. Their API docs indicate recordings can be fetched in different formats. The simplest approach: append `?format=mp3` or swap the extension. If that doesn't work, we fall back to an edge function conversion.

**Recommended first step:** Add a simple download button that modifies the recording URL extension from `.wav` to `.mp3` (Retell supports this). No edge function needed unless the URL format doesn't support it.

### Files Changed
- **`src/pages/CallsPage.tsx`** — add Download button in recording section
- **`src/components/TestResultsModal.tsx`** — add Download button
- **`src/pages/CampaignDetailPage.tsx`** — change "Listen to Recording" to include a download option

