

# Upgrade University Page Feedback to Chat-Style with Voice Recording

## What We're Building
Replace the plain textarea feedback section on the University page with a conversational, AI-prompt-style input — similar to a chat interface. It will support both typed and voice-recorded feedback (using the same microphone + transcription flow already built in `TestResultsModal`).

## Approach
Extract the `UserFeedbackSection` component from `TestResultsModal.tsx` into a shared component, then use it in `UniversityPage.tsx`. This avoids duplicating the voice recording, transcription, and save logic.

Alternatively (simpler, less refactor risk): copy the recording/transcription pattern directly into the University page's `ResultCard`, upgrading the existing plain textarea to match the chat-style UX from `TestResultsModal`.

**Recommended: Option 2** — inline the recording logic into `UniversityPage.tsx`'s feedback section, matching the `TestResultsModal` pattern. This keeps changes contained to one file.

## Changes

### `src/pages/UniversityPage.tsx`
- Import `Mic`, `MicOff`, `Send`, `MessageSquarePlus`, `Pencil` from lucide-react
- Add `recording`, `transcribing` states + `mediaRecorderRef` / `chunksRef` refs to `ResultCard`
- Add `startRecording`, `stopRecording`, `transcribeAudio` handlers (same pattern as `TestResultsModal`)
- Replace the current plain textarea + "Save Feedback" button with the chat-style layout:
  - A prompt-style input area with rounded borders, placeholder text like "e.g., 'The agent was too pushy...'"
  - A helper text: "Share what you noticed. Your feedback will be factored into evaluation and improvements."
  - A "Submit Feedback" button with `Send` icon
  - A "Record Feedback" / "Stop Recording" button with `Mic`/`MicOff` icons
  - Transcribing state with spinner
- Saved feedback display: styled card with `Edit` button (same as `TestResultsModal`)

### No backend changes needed
The `transcribe-and-ingest` edge function already supports `mode: "transcribe_only"` and the `test_run_contacts.user_feedback` column already exists.

### Files Changed
- **`src/pages/UniversityPage.tsx`** — Upgrade feedback section with voice recording and chat-style UX

