

# Fix: Auto-Train Timing Out (Edge Function 150s Limit)

## Problem
The "Failed to fetch" error occurs because the `auto-train` edge function exceeds the ~150-second execution limit. With 3 rounds × 3 calls, each simulation + evaluation taking 30-60s, the total runtime reaches 5+ minutes — far beyond what edge functions support.

## Solution
Move the training orchestration loop from the edge function to the frontend. The `SimulationTraining` component will call `simulate-call` and `evaluate-call` individually per call, tracking progress in real-time. This gives better UX (live progress per call) and avoids the timeout.

### Changes to `src/components/SimulationTraining.tsx`
Replace the single `auto-train` invocation with a client-side loop:

1. For each round (1 to `maxRounds`):
   - For each call (1 to `callsPerRound`):
     - Invoke `simulate-call` with `{ project_id, customer_difficulty, max_turns: 12 }`
     - Collect the evaluation from the response
   - Update round results in state (scores, fixes applied)
   - Check for score >= 9.0 early exit
2. Show real-time progress: current round, current call number, per-call scores as they arrive
3. Remove the `auto-train` edge function invocation entirely — the component becomes the orchestrator

**Key benefits:**
- Each edge function call completes in ~30-60s (well within limits)
- Live progress updates per call instead of waiting for the entire batch
- No changes needed to `simulate-call` or `evaluate-call` functions

### No backend changes needed
The `simulate-call` function already returns evaluation data. The `auto-train` edge function can remain for programmatic/API use but the UI won't depend on it.

## Files
- `src/components/SimulationTraining.tsx` — Rewrite training loop to be client-side

