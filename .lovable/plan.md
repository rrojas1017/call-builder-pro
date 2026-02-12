

# Enhanced Call Quality Evaluation with Voice Quality Scoring

## Problem
The current `evaluate-call` function only analyzes the text transcript. It doesn't detect voice quality issues like mispronunciations, unnatural pacing, filler words, awkward pauses, or robotic delivery. When Bland AI makes mistakes during a call, the evaluation misses them because it only reads what was said, not how it was said.

## Solution
Enhance the evaluation system in two ways:

1. **Capture the recording URL** from Bland's webhook so it's available for playback and future audio analysis
2. **Expand the evaluation prompt** to explicitly score voice/delivery quality based on transcript cues (hesitations, repeated words, garbled text, unnatural phrasing)
3. **Add a "naturalness_score"** to the evaluation rubric and surface it in the UI
4. **Add an "Apply All Fixes" button** so improvements can be batch-applied after a test

## Changes

### 1. Store `recording_url` from Bland webhook
Update `receive-bland-webhook/index.ts` to extract `recording_url` from the webhook payload and store it in both `test_run_contacts` and `calls` tables.

Database migration:
- Add `recording_url text` column to `test_run_contacts`
- Add `recording_url text` column to `calls` (if not already present)

### 2. Enhance `evaluate-call` evaluation prompt
Update the system prompt to include voice/delivery quality analysis based on transcript patterns:
- Score **naturalness** (0-100): detect filler words, repeated phrases, garbled text, unnatural sentence structure
- Score **pacing**: detect rushed or overly slow delivery patterns in the transcript
- Add `naturalness_score` and `delivery_issues` to the evaluation JSON schema
- Include specific instructions to look for common AI voice mistakes (mispronounced words, cut-off sentences, robotic transitions)

### 3. Update TestResultsModal UI
- Add a 4th ScoreCard for "Naturalness" alongside Compliance, Objective, and Overall
- Show `delivery_issues` in the issues section
- Add a "Play Recording" button when `recording_url` is available
- Add an "Apply All Fixes" button that batch-applies all recommended improvements

### 4. Pass recording URL to evaluate-call
Update the evaluate-call function to also load the recording URL from the call record (for future audio-based analysis, and to include in the evaluation context).

## Technical Details

- The `recording_url` comes from Bland's webhook payload when `record: true` is set (already configured)
- The naturalness scoring is transcript-based -- looking for patterns like repeated words, incomplete sentences, "[inaudible]" markers, and unnatural transitions
- No new API keys or secrets needed
- The `naturalness_score` is added to the existing evaluation JSON structure, so the `apply-improvement` flow still works
- The recording playback uses a standard HTML audio element pointing to the Bland/Twilio recording URL

