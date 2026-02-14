

## Fix: "No WebSocket URL returned" Error

### Root Cause

There are two problems:

1. **Frontend doesn't check for backend error messages**: The edge function now correctly returns `{ error: "some Bland message" }` with HTTP 200 (from the previous fix), but `LiveCallMonitor.tsx` only checks for Supabase SDK-level errors. It skips the `data.error` field and tries to read `data.websocket_url`, which is undefined -- resulting in the generic "No WebSocket URL returned" toast.

2. **Bland API returned a 400**: This typically means one of:
   - The call hasn't fully connected yet (you clicked "Listen Live" too early)
   - The call has already ended
   - Live Listening isn't enabled on your Bland AI dashboard

### Changes

**`src/components/LiveCallMonitor.tsx`**

In the `handleListen` function, after the edge function call succeeds:
- Check `data.error` first and surface it as a descriptive toast instead of the generic message
- This ensures the actual Bland error message (e.g., "Call not found" or "Live listening not enabled") is shown to the user

```
const { data, error } = await supabase.functions.invoke(...)
if (error) throw error;
if (data?.error) throw new Error(data.error);  // <-- add this line
const wsUrl = data?.websocket_url;
```

This is a one-line fix that properly surfaces the real error from Bland AI.

### What stays the same
- Edge function logic (already fixed in last edit)
- All other LiveCallMonitor functionality (transcript polling, audio playback, WebSocket handling)
