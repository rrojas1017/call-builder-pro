

## Fix Voice Recording Transcription for Feedback

### Problem
Both `UniversityPage.tsx` and `TestResultsModal.tsx` record audio via the browser microphone and send it to `transcribe-and-ingest` with `{ audio_base64, mode: "transcribe_only" }`. However, the `transcribe-and-ingest` edge function expects `{ project_id, file_path }` and downloads audio from Supabase Storage — it has no handling for `audio_base64` or `mode: "transcribe_only"`. This means every voice recording attempt fails with a 400 error ("project_id and file_path are required").

### Solution
Create a lightweight dedicated edge function `transcribe-feedback` that accepts base64 audio directly and returns the transcribed text. This keeps the existing `transcribe-and-ingest` function (which handles the full knowledge ingestion pipeline) untouched.

### Changes

1. **New edge function: `supabase/functions/transcribe-feedback/index.ts`**
   - Accepts `{ audio_base64, format? }` in the request body
   - Sends the audio to Gemini 2.5 Flash via the Lovable AI gateway for transcription
   - Returns `{ text: "transcribed content" }`
   - No storage, no knowledge extraction — just transcription

2. **Update `src/pages/UniversityPage.tsx`** (lines ~878-879)
   - Change `supabase.functions.invoke("transcribe-and-ingest", ...)` to `supabase.functions.invoke("transcribe-feedback", ...)`

3. **Update `src/components/TestResultsModal.tsx`** (lines ~601-603)
   - Same change: invoke `transcribe-feedback` instead of `transcribe-and-ingest`

### Technical Notes
- Uses `LOVABLE_API_KEY` (already configured) for the Gemini gateway
- The base64 spread approach (`String.fromCharCode(...new Uint8Array(arrayBuffer))`) can fail on large recordings due to max call stack size. Will switch to a chunked conversion method.

