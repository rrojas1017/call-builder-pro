

# Fix: Recording Player Fails Silently (0:00 / 0:00)

## Problem

The audio player shows `0:00 / 0:00` because the browser can't load either the MP3 or WAV source. This is almost certainly a **CORS issue** — Retell's CloudFront CDN doesn't serve the `Access-Control-Allow-Origin` header needed for the preview domain to stream the audio via `<audio>` tags. The `<source>` element fails silently with no user feedback.

The existing download button works because its fallback opens the URL in a new tab (bypassing CORS), but the inline player has no such fallback.

## Fix

Update the `RecordingPlayer` component in `src/pages/UniversityPage.tsx` (and equivalents in `CallsPage.tsx`, `TestResultsModal.tsx`) to:

1. **Detect load failure** — add an `onError` event on the `<audio>` element that sets a `loadFailed` state
2. **Show fallback UI** — when load fails, replace the broken player with a button that opens the MP3 URL directly in a new tab (which bypasses CORS) and a download button
3. **Try fetch-based approach first** — before giving up, attempt to `fetch()` the MP3 as a blob and create an object URL (this works if CORS is allowed for fetch but not for media elements, which sometimes happens)

| File | Change |
|------|--------|
| `src/pages/UniversityPage.tsx` | Add error detection + fetch-blob fallback + open-in-tab fallback to `RecordingPlayer` |
| `src/pages/CallsPage.tsx` | Same error handling for the calls page audio player |
| `src/components/TestResultsModal.tsx` | Same error handling |

