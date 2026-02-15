

## Add "Grading in Progress" Processing State

### Problem

After a University test call ends, there's a dead zone: the call status changes to "completed" but the evaluation hasn't arrived yet (the webhook triggers AI evaluation which takes 10-30 seconds). During this time, the user sees the transcript but no scores and no indication that anything is happening. It looks like nothing is processing.

### Solution

Add a visual processing indicator that appears when a call is completed but has no evaluation yet. This bridges the gap between call end and grading results.

### Changes

**File: `src/pages/UniversityPage.tsx` -- `ResultCard` component (~line 600)**

After the transcript section and before the evaluation section, add a conditional block:

```
If contact.status === "completed" AND contact.evaluation is null:
  Show an animated "Grading in progress" card with:
  - A pulsing/spinning icon
  - "Analyzing transcript..." text
  - 3-step pipeline showing: Transcript received -> Evaluating performance -> Calculating scores
  - Each step lights up based on available data (transcript present = step 1 done)
```

This uses existing data -- no new DB columns or backend changes needed. The realtime subscription already polls for updates, so once the evaluation lands, the grading card disappears and scores appear.

### Technical Details

| File | Change |
|---|---|
| `src/pages/UniversityPage.tsx` | Add `GradingProgress` component between transcript and evaluation in `ResultCard`. Shows animated processing steps when `status === "completed"` and `evaluation` is null. |

The component renders 3 steps:
1. "Transcript received" -- checked immediately (transcript exists)
2. "Evaluating performance" -- shown as active/spinning
3. "Calculating graduation level" -- shown as pending

Once `contact.evaluation` populates via the existing realtime subscription, this component unmounts and scores render normally.

