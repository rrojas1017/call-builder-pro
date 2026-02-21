

# Fix: Better Error Handling for Retell Number Purchase

## Problem
When purchasing a Retell (Append) inbound number fails (e.g., area code 312 has no available numbers), the error toast shows a generic "Edge Function returned a non-2xx status code" instead of the actual message "No phone numbers of this area code."

This happens because `supabase.functions.invoke` wraps non-2xx responses in a `FunctionsHttpError` whose `.message` is generic. The actual error details are in the response body, which must be extracted separately.

## Solution
Update the `handlePurchase` function in `InboundNumbersPage.tsx` to extract the actual error message from the edge function response body, similar to the existing `extractEdgeFunctionError` pattern used elsewhere in the project.

## Changes

**File:** `src/pages/InboundNumbersPage.tsx`

### In the `handlePurchase` function (Retell branch):
After calling `supabase.functions.invoke`, check if `data` contains an `error` field (which happens when the edge function returns 400 with `{ error: "..." }`). Also handle the `FunctionsHttpError` case by reading its response body.

```text
// For Retell purchase:
const { data, error } = await supabase.functions.invoke("manage-retell-numbers", { ... });
if (error) {
  // Try to extract the body from FunctionsHttpError
  const body = await error?.context?.json?.().catch(() => null);
  throw new Error(body?.error || error.message);
}
if (data?.error) throw new Error(data.error);
```

Apply the same pattern to the Bland purchase branch and the assign/unassign/release handlers for consistency.

### Technical Detail
The Supabase JS client's `functions.invoke()` returns `{ data, error }` where:
- On 2xx: `data` has the parsed JSON, `error` is null
- On non-2xx: `error` is a `FunctionsHttpError` with a generic message, but the response body with the real error is accessible via `error.context` (a `Response` object)

We need to read `error.context.json()` to get the actual error message from our edge function.

## Files Modified
- `src/pages/InboundNumbersPage.tsx` -- improve error extraction in purchase, assign, unassign, and release handlers

