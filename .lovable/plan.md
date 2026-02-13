

## Fix: Surface Backend Error Messages and Improve Credit Check UX

### Problem
1. The `run-test-run` edge function checks `organizations.credits_balance` in the database (not Bland's balance). When it's 0, it returns HTTP 402 with `"Insufficient credits"` -- but the frontend shows a generic "non-2xx status code" error instead.
2. Users have no way to know their in-app credit balance from the Test Lab page.

### Changes

**`src/pages/GymPage.tsx`** -- Better error handling in `handleRunTest`

The Supabase `functions.invoke` returns errors in a special way for non-2xx responses. When the edge function returns 402, the SDK wraps it in a `FunctionsHttpError`. The fix:

- After `supabase.functions.invoke("run-test-run", ...)`, check if the response contains an error object with a `context` property (which holds the Response)
- Parse the response body JSON to extract the real error message (e.g., "Insufficient credits. Please top up your balance.")
- Display that message in the toast instead of the generic SDK message
- Apply the same pattern to the `create-test-run` invoke call

The error handling block (around lines 268-275) will change from:
```
if (runErr) throw runErr;
```
to parsing the actual response body from `runErr.context` to get the real error message.

- Same improvement applied to the `create-test-run` call (around line 262)

### No backend changes needed
The backend already returns proper error messages -- this is purely a frontend fix to surface them.
