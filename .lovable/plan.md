

## Fix: Incorrect Call Duration on Campaign Dashboard

### Problem

The campaign dashboard shows calls lasting "0 seconds" or "2 seconds" when they actually lasted 16s, 38s, or 104s. This is because the webhook trusts `body.call_length` from Bland AI, which reports wildly inaccurate values.

**Evidence from your campaign:**

| Call | Bland reported | Actual (from timestamps) |
|------|---------------|--------------------------|
| Ramon Rojas (407 area code) | 2s | 104s (1m 44s) |
| Jean Rojas | 0s | 16s |
| Bryan Contreras | 0s | 38s |

### Root Cause

In `supabase/functions/receive-bland-webhook/index.ts`, the duration is taken directly from the webhook payload:

```text
const duration = body.call_length || body.duration || null;
```

Bland AI's `call_length` field is unreliable. The correct approach is to compute duration from `body.created_at` and `body.end_at`, which Bland does report accurately (our `started_at` / `ended_at` timestamps already prove this).

### Fix

**File:** `supabase/functions/receive-bland-webhook/index.ts`

1. After extracting `body.created_at` and `body.end_at`, compute duration as `(end - start)` in seconds
2. Fall back to `body.call_length` only if timestamps are missing
3. Apply this computed duration everywhere in the function (test lab flow, inbound flow, campaign flow)

**Logic:**

```text
// Compute duration from timestamps (reliable) instead of trusting call_length
const startedAt = body.created_at ? new Date(body.created_at) : null;
const endedAt = body.end_at ? new Date(body.end_at) : null;
let duration: number | null = null;
if (startedAt && endedAt) {
  duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
} else {
  duration = body.call_length || body.duration || null;
}
```

This is a single change at the top of the function that fixes all three flows (test lab, inbound, campaign) since they all use the same `duration` variable.

### Also: Fix Existing Data

After deploying, the 3 existing calls can be corrected with a one-time database update that recalculates `duration_seconds` from `started_at` / `ended_at` for this campaign's calls.

### Technical Summary

| File | Change |
|---|---|
| `supabase/functions/receive-bland-webhook/index.ts` | Replace `body.call_length` with computed duration from timestamps. ~5 lines changed at the top of the function. |

