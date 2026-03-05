

# Fix: Hang-up Not Actually Ending the Call

## Problem
The logs confirm: when you clicked "Stop" for call `call_347af24b8f0e42408cc4893536b`, the `stop-call` function hit Retell's `POST /v2/end-call/{call_id}` and got a **404**. The function treated 404 as "already ended" and returned `{ success: true }` to the UI — but the call was still active and ran for another ~40 seconds until it ended naturally.

## Root Cause
Two issues in `supabase/functions/stop-call/index.ts`:

1. **404 is treated as success** — the function logs "Call already ended" and returns `{ success: true }`, but 404 from Retell can mean the call ID wasn't found in their system (not that it ended). The call continues on the telephony side.
2. **No retry or fallback** — if the primary endpoint fails, nothing else is tried.

## Fix

### File: `supabase/functions/stop-call/index.ts`

1. **Add retry with delay** — If the first `end-call` returns 404, wait 1 second and retry once (Retell can have propagation delays).
2. **Add `DELETE /v2/delete-call/{call_id}` as fallback** — If `end-call` still returns 404, try the delete endpoint which forcefully removes the call.
3. **Return actual status to client** — Instead of always returning `{ success: true }`, include whether the call was actually terminated vs. not found, so the UI can warn the user.
4. **Log the response body on 404** for better debugging.

### Client-side (no changes needed)
The UI already handles the response — once we return accurate status, the existing toast will properly reflect what happened.

