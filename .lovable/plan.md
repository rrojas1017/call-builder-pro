

# Fix: Large Recording Playback Fails on WAV Files

## Problem

The 15-minute recording (942 seconds) is stored as a `.wav` file at CloudFront. A 15-min WAV is ~150MB+. The `<audio>` element uses the raw `.wav` URL directly, and browsers struggle to load/stream large uncompressed WAV files — they often hang, timeout, or silently fail.

Meanwhile, the codebase already has a `toMp3Url()` helper that converts `.wav` URLs to `.mp3` (Retell stores both formats). But this helper is **only used for the download button**, never for the audio player `src`.

## Fix

Use the MP3 URL as the primary source for the audio player, with WAV as fallback. This applies to three locations:

### 1. `src/components/TestResultsModal.tsx` (line 228)

Change the `<audio>` element to try MP3 first, WAV as fallback:
```html
<audio controls className="w-full h-8">
  <source src={toMp3Url(selected.recording_url)} type="audio/mpeg" />
  <source src={selected.recording_url} type="audio/wav" />
</audio>
```

### 2. `src/pages/CallsPage.tsx` (lines 609-614)

Same change — use `<source>` tags with MP3 first:
```html
<audio controls className="w-full h-10" onRateChange={...}>
  <source src={toMp3Url(selected.recording_url)} type="audio/mpeg" />
  <source src={selected.recording_url} type="audio/wav" />
</audio>
```

### 3. `src/pages/UniversityPage.tsx` — `RecordingPlayer` component

Same pattern for the university page audio player.

### 4. `src/pages/CampaignDetailPage.tsx`

If there's an inline audio player there, apply the same fix.

| File | Change |
|------|--------|
| `src/components/TestResultsModal.tsx` | Use MP3 source with WAV fallback in audio player |
| `src/pages/CallsPage.tsx` | Same MP3-first audio source change |
| `src/pages/UniversityPage.tsx` | Same change in `RecordingPlayer` component |
| `src/pages/CampaignDetailPage.tsx` | Same change if audio player exists |

All files already import `toMp3Url` (or `downloadRecordingMp3` which uses it), so the import of `toMp3Url` just needs to be added where missing.

