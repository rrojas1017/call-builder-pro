

## Add Call Recording Playback to University Call History

### Problem
When a call is selected from the Call History in the University page, there is no way to listen to the recording. The `recording_url` column exists in the database but is neither fetched nor displayed.

### Changes

**File: `src/pages/UniversityPage.tsx`**

1. **Add `recording_url` to the `TestContact` interface** (around line 30) -- add `recording_url?: string | null;`

2. **Include `recording_url` in the `loadHistory` mapping** (around line 171-184) -- add `recording_url: r.recording_url` to the mapped object.

3. **Add an audio player in the Result section** (after the transcript block, around line 621). Display an HTML5 audio player with playback speed controls (1x, 1.25x, 1.5x, 2x) when `contact.recording_url` is available. This follows the same pattern already used on the Calls page.

4. **Also include `recording_url` in the real-time contact updates** -- ensure when a contact is loaded from the active test run (not just history), the recording URL is also available once the call completes.

### What Users Get
- Full recording playback directly in the University result view
- Playback speed controls (1x to 2x) so they can quickly scrub through to the relevant section
- Works for both new test calls and historical calls loaded from the history list
