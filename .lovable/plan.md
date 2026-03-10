

## Root Cause

The webhook signature verification logic in `receive-retell-webhook` is **completely wrong**. Here's why:

Retell's actual signature format is: `v=1234567890,d=abcdef1234...` where:
- The timestamp and digest are embedded in the `x-retell-signature` header
- The HMAC-SHA256 is computed over `body + timestamp` (concatenated)
- The **secret key is the Retell API Key** (the one with the "Webhook" badge), not a separate webhook secret

Our current code treats the entire header value as a raw hex digest and computes HMAC over just the body using `RETELL_WEBHOOK_SECRET`. This will **never** match.

## Plan

### 1. Fix the `verifyRetellSignature` function in `receive-retell-webhook/index.ts`

Replace the current verification with logic that matches Retell's SDK:
- Parse the `x-retell-signature` header to extract timestamp (`v=`) and digest (`d=`)
- Use `RETELL_API_KEY` (already configured) as the HMAC secret instead of `RETELL_WEBHOOK_SECRET`
- Compute HMAC-SHA256 over `rawBody + timestamp`
- Add a 5-minute replay protection window
- Fall back gracefully if the header format doesn't match

This is the only change needed. Once the webhook processes correctly, call results will flow into the database, evaluations will be triggered, and the University history will populate.

### Technical Details

Current broken logic:
```
HMAC-SHA256(RETELL_WEBHOOK_SECRET, rawBody) === signatureHeader
```

Correct logic (matching Retell SDK):
```
Parse "v=<timestamp>,d=<digest>" from header
HMAC-SHA256(RETELL_API_KEY, rawBody + timestamp) === digest
```

