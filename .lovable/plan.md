

# Fix: Retry Outbound Call After Transfer Agent Auto-Switch

## Problem
The 2-second delay after auto-switching from transfer to outbound is not enough for Retell's API to propagate the change. The `create-phone-call` endpoint still sees the old agent state and rejects the call.

## Solution
Add a retry loop around the Retell `create-phone-call` API call. If it fails with "Transfer agents cannot be used for outbound calls", wait 3 seconds and retry up to 3 times. This handles Retell's eventual consistency without blocking unnecessarily on calls that work the first time.

## Changes

### 1. Update `run-test-run` edge function (Retell branch)
Wrap the `create-phone-call` fetch in a retry loop inside the per-contact loop:

```text
For each contact:
  1. Build retellPayload (unchanged)
  2. Attempt create-phone-call (up to 3 times)
     - If response contains "Transfer agents cannot be used for outbound calls":
       - Log warning with attempt number
       - Wait 3 seconds
       - Retry
     - If success or different error: proceed as normal
```

### 2. No other files changed
The retry logic is entirely within the existing per-contact loop in the Retell branch.

## Technical Details

The retry wraps only the `fetch` to `create-phone-call` and the response handling. The pre-flight auto-switch and 2-second initial delay remain in place. The retry adds resilience for cases where propagation takes longer than 2 seconds (up to ~11 seconds total: 2s initial + 3 retries x 3s each).

## Files Changed
- **Modified**: `supabase/functions/run-test-run/index.ts` -- add retry loop around Retell create-phone-call

