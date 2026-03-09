

# Add Feedback Prompt to University Page

## Problem
The University page shows test call results (transcript, scores, improvements) but has no way for the user to provide typed or voice-recorded feedback after a call completes. This feature only exists in `TestResultsModal` (used in the Edit Agent's Test Lab).

## Solution
Add a "Your Feedback" section to the `ResultCard` component in `UniversityPage.tsx`, shown after a call completes. It should include:
- A textarea for typed feedback
- A save button that writes feedback to the `test_run_contacts` row
- Display saved feedback with an "Edit" option

Voice recording can be added later if desired -- for now, typed feedback matches the core need.

## Changes

### `src/pages/UniversityPage.tsx`
In the `ResultCard` sub-component, after the evaluation section and before the recommended improvements:
- Add a feedback state (`feedbackText`, `savingFeedback`, `editingFeedback`)
- Load existing feedback from `contact.user_feedback` (if the column exists) or `contact.feedback`
- Show a textarea + Save button when status is `completed`
- On save, update the `test_run_contacts` row with the feedback text
- After saving, show the feedback text with an Edit button

Need to check which column stores feedback on `test_run_contacts`.

### Files Changed
- **`src/pages/UniversityPage.tsx`** -- Add feedback section to ResultCard

