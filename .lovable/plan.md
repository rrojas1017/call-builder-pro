

# Add User Feedback Input Per Test Call

## What We're Building

A feedback prompt on each completed test call in the TestResultsModal that lets users type or voice-record their observations. This feedback gets saved to `test_run_contacts.evaluation` (merged into the existing JSON) and is included when the evaluate-call function processes the call, so it becomes part of the general feedback/improvement pipeline.

## Changes

### 1. Database: Add `user_feedback` column to `test_run_contacts`
Add a text column `user_feedback` to store typed or transcribed voice feedback from the user.

### 2. UI: Add Feedback Section in `TestResultsModal.tsx`
After the evaluation results for each completed contact, add:
- A textarea for typed feedback
- A "Record Feedback" button that uses the browser's MediaRecorder API to capture audio, then sends it to the Lovable AI gateway (Gemini Flash) for transcription
- A "Submit Feedback" button that saves to `test_run_contacts.user_feedback`
- Once submitted, show the feedback as read-only text with an edit option
- Visual indicator showing feedback was submitted

### 3. Edge Function: Include user feedback in `evaluate-call`
In the evaluate-call function, when processing test calls:
- Fetch the `user_feedback` field from `test_run_contacts`
- If present, append it to the evaluation prompt as "User's own feedback after this call: ..."
- This ensures the verbal training detector and improvement recommender consider the user's manual observations alongside the transcript analysis

### Files Changed
- **Database migration** -- add `user_feedback text` column to `test_run_contacts`
- **`src/components/TestResultsModal.tsx`** -- add feedback input UI (textarea + voice record button)
- **`supabase/functions/evaluate-call/index.ts`** -- include `user_feedback` in evaluation context

