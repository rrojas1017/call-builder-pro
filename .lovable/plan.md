

# Fix Bland API Error in Quick Test

## Problem
The Quick Test call fails with a generic "Bland API error" message. The edge function doesn't log the actual Bland API response, making debugging impossible.

## Root Cause Investigation
The `run-test-run` edge function sends the call to Bland AI but when it fails:
1. It only checks for `blandData.call_id` to determine success
2. On failure, it saves `blandData.message || "Bland API error"` -- but Bland may return the error in a different field
3. The actual Bland response is never logged, hiding the real error

## Fix

### 1. Add logging to `run-test-run` edge function
- Log the full Bland API response body when a call fails
- Log the HTTP status code from Bland
- Store the full error details (not just `blandData.message`) in the `error` field

### 2. Improve error capture
Change the error storage to capture more detail:
```typescript
// Before:
error: blandData.message || "Bland API error"

// After: 
error: blandData.message || blandData.error || JSON.stringify(blandData)
```

Also add `console.log` to capture the response for debugging:
```typescript
console.log("Bland API response:", blandResp.status, JSON.stringify(blandData));
```

### Files to Modify
- `supabase/functions/run-test-run/index.ts` -- Add logging and better error capture

## Technical Details
The change is minimal: add a `console.log` for the Bland response and expand the error field to capture the actual error message regardless of which field Bland returns it in. This will let us see the real error in the edge function logs and display it to the user.
