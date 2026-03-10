

# Fix: Graceful Error Handling in Live Simulation Chat

## Problem
The session replay shows the simulation errored with "Failed to send a request to the Edge Function" mid-conversation (after ~8 messages). This is a transient network/timeout error from the Supabase client. The current code throws on any error, killing the whole simulation and showing a scary toast — even though the conversation was nearly done (customer was saying "I'm hanging up").

## Root Cause
The error handling in the turn loop (lines 102, 134) does a hard `throw` on any edge function error, which aborts the entire simulation. For transient failures late in a conversation, this is unnecessarily destructive.

## Fix

### `src/components/LiveSimulationChat.tsx`
1. **Wrap individual turn calls in try/catch** instead of letting them bubble up to the outer catch. If a single turn fails:
   - Retry once after a 2-second pause
   - If retry also fails, gracefully end the conversation with a system message like "Connection lost — conversation ended"
   - Still show the messages exchanged so far (don't clear them)
   - Still allow "Save & Learn" on the partial conversation

2. **Show a softer toast** for mid-conversation errors: "Simulation ended early due to a connection issue" instead of the raw error message.

3. **Fix the Badge ref warning** from console logs — the component is passing a ref to Badge which doesn't support it. Remove or wrap the ref.

## Files
- `src/components/LiveSimulationChat.tsx` — Add per-turn retry logic, graceful termination, fix Badge ref warning

