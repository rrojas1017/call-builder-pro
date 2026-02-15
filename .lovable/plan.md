

## Fix: Missing Call History for Cancelled-but-Evaluated Calls

### Problem
The call to Bryan (test run `90ec700f`) lasted 27 seconds, has a transcript, and has an evaluation -- but it does not appear in Call History because its `status` is `cancelled`. The `loadHistory` query only fetches contacts with `status = 'completed'`.

This happens when the "Stop All Calls" button is pressed after the call has already finished on the provider side but before the status was updated to `completed` locally.

### Root Cause
In `src/pages/UniversityPage.tsx`, line 163:
```
.eq("status", "completed")
```
This excludes any contact whose status is `cancelled`, even if it has a valid evaluation and transcript.

### Fix

**File: `src/pages/UniversityPage.tsx`**

Replace the `.eq("status", "completed")` filter (line 163) with `.in("status", ["completed", "cancelled"])`.

The existing `.not("evaluation", "is", null)` filter on line 164 already ensures only contacts with actual evaluations are shown, so including `cancelled` contacts that were evaluated is safe and correct.

### Technical Detail

```typescript
// Before
.eq("status", "completed")
.not("evaluation", "is", null)

// After
.in("status", ["completed", "cancelled"])
.not("evaluation", "is", null)
```

This is a one-line change. No other files are affected.
