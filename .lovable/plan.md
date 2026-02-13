

# Fix: Bland API Returning HTML Instead of JSON

## Root Cause
In `supabase/functions/run-test-run/index.ts` (line 261), the code does `const blandData = await blandResp.json()` after calling the Bland API. But Bland is returning an HTML error page (like a 404 or 502) instead of JSON. Calling `.json()` on HTML throws the "Unexpected token '<'" error, which gets saved as the contact's error message.

## Fix

### 1. `supabase/functions/run-test-run/index.ts`
Add a response check before parsing JSON from Bland:

- After the `fetch("https://api.bland.ai/v1/calls", ...)` call (line 255-259), read the response as text first
- Check if the response status is OK and the content looks like JSON
- If Bland returns a non-JSON response (HTML error page), save a clear error message like "Bland API returned HTTP {status}: {first 200 chars}" instead of crashing
- This turns the cryptic "Unexpected token" error into something actionable

```
// Before (crashes on HTML):
const blandData = await blandResp.json();

// After (handles gracefully):
const blandText = await blandResp.text();
let blandData;
try {
  blandData = JSON.parse(blandText);
} catch {
  throw new Error(`Bland API returned non-JSON (HTTP ${blandResp.status}): ${blandText.substring(0, 200)}`);
}
```

This also helps debug the actual Bland issue -- the error message will now show the HTTP status code and a snippet of what Bland actually returned, making it clear whether it's an auth problem, a rate limit, or a service outage.

## Files to Modify
- `supabase/functions/run-test-run/index.ts` -- safe-parse Bland API response
