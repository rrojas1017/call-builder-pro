

## Fix: Double-Counted Attempts

### Root Cause

Two functions both write to the `attempts` column on the `contacts` table:

1. `tick-campaign/index.ts` sets `attempts: 1` when it begins dialing a contact (line 302)
2. `receive-bland-webhook/index.ts` reads the current attempts and adds +1 when the call finishes (line 245)

Result: every single call shows 2 attempts instead of 1.

### Fix

Remove `attempts: 1` from `tick-campaign` in both places where it sets contact status to "calling". The webhook is the authoritative source -- it increments attempts after a call actually completes. The tick function should only update `status` and `called_at`.

### Changes

**File: `supabase/functions/tick-campaign/index.ts`**

- Line ~212: Change `{ status: "calling", attempts: 1, called_at: ... }` to `{ status: "calling", called_at: ... }` (Retell path)
- Line ~302: Change `{ status: "calling", attempts: 1, called_at: ... }` to `{ status: "calling", called_at: ... }` (Bland batch path)

Two small edits in one file. No other files affected.

### Impact

- Existing contacts already showing "2" won't auto-correct (the data is already written), but all future calls will correctly show 1 attempt per actual call
- Redial logic in tick-campaign reads `attempts` to decide retry eligibility -- this will now be accurate, preventing contacts from hitting `max_attempts` prematurely
