

## Analysis

I found the **exact Retell SDK source code** for webhook verification. Our HMAC algorithm and payload format (`rawBody + timestamp`) are correct and match the SDK exactly. However, the webhook is still failing with digest mismatches.

### Root Cause

There are two issues:

1. **Replay protection uses wrong time unit**: The Retell SDK uses **milliseconds** (`Date.now()`) for timestamps, but our code converts to seconds (`Math.floor(Date.now() / 1000)`) before comparing. This causes valid webhooks to be rejected as "too old" even though the digest might match. However, the timestamp check currently happens before the HMAC check, so this isn't causing the digest mismatch directly.

2. **The `RETELL_API_KEY` may not be the webhook-badged key**: In your Retell dashboard screenshot, there was a "Secret Key" with a **Webhook badge**. The Retell docs explicitly state: *"Only the API key that has a webhook badge next to it can be used to verify the webhook."* If the value stored in `RETELL_API_KEY` is a different API key than the webhook-badged one, verification will always fail.

### Plan

**File: `supabase/functions/receive-retell-webhook/index.ts`**

1. Fix the replay protection to use **milliseconds** (matching the Retell SDK)
2. Add detailed debug logging to identify whether the API key mismatch is the issue
3. As a pragmatic fix: check `RETELL_WEBHOOK_SECRET` first (the value the user already updated from the dashboard), then fall back to `RETELL_API_KEY`

Specifically:
- Change `Math.floor(Date.now() / 1000)` → `Date.now()` and compare against `300_000` (5 min in ms) instead of `300`
- Try verification with `RETELL_WEBHOOK_SECRET` first, then `RETELL_API_KEY` as fallback — since the user already copied the webhook-badged key into `RETELL_WEBHOOK_SECRET`

