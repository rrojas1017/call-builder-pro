

# Problem: Training Simulations Don't Apply Improvements

## What's Happening
The training loop in `SimulationTraining.tsx` runs simulations → gets evaluations with scores and recommendations → but **never applies** those recommendations back to the agent spec. The old `auto-train` edge function had an `applyRecommendations` step that called `apply-audit-recommendation` for critical/important fixes, but when we moved to client-side orchestration, that step was lost.

So right now: the agent gets scored, but **never learns**.

## Fix
After each training round completes, call `apply-audit-recommendation` for any critical/important recommendations from the evaluations — exactly like `auto-train` did.

### Changes to `src/components/SimulationTraining.tsx`
1. After each round's calls finish and scores are calculated, collect `recommended_improvements` from all evaluations
2. Filter for `critical` and `important` severity
3. Call `apply-audit-recommendation` for each one (sequentially to avoid race conditions)
4. Show applied fixes count in the round results UI (e.g. "2 fixes applied")
5. Add a "Fixes Applied" indicator per round in the results display

### Changes to `src/components/LiveSimulationChat.tsx`
After the live practice conversation ends, optionally trigger evaluation + improvement application so live practice also contributes to learning. Add a "Save & Learn" button at the end of a conversation that:
- Saves the transcript as a simulated call via `simulate-call` (or directly to calls table)
- Triggers evaluation
- Applies recommendations

## Files
- `src/components/SimulationTraining.tsx` — Add post-round improvement application loop
- `src/components/LiveSimulationChat.tsx` — Add "Save & Learn" post-conversation action

