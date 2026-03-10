

# Replace SimulationTrainingPanel with Enhanced SimulationTraining Component

## Overview
Replace the existing `SimulationTrainingPanel` with a more feature-rich `SimulationTraining` component that adds single-call testing, expandable transcript viewing, and better progress/result display. Also redeploy the stale `auto-train` edge function.

## Changes

### 1. Create `src/components/SimulationTraining.tsx` — **New**
Full-featured training UI with:
- Mode selector (Simulate / Hybrid / Live) with icons
- Difficulty selector (Easy / Medium / Hard / Mixed)
- Rounds (1-10) and Calls-per-round (1-10) sliders
- "Start Training" button for full auto-train loop
- "Test 1 Call" button for quick single simulation with inline transcript viewer
- Per-round collapsible results with score deltas, fix details, rollback info
- Progress bar during training

### 2. Update `src/pages/UniversityPage.tsx`
- Replace `import SimulationTrainingPanel` with `import SimulationTraining`
- Replace the `<SimulationTrainingPanel>` usage (lines 593-602) with `<SimulationTraining projectId={agentId} />`

### 3. Redeploy `supabase/functions/auto-train/index.ts`
- Add a trivial whitespace change to trigger redeployment
- This fixes the "contacts required" error when running in simulate mode

### 4. Optionally remove `src/components/SimulationTrainingPanel.tsx`
- No longer needed after replacement

## Files
- `src/components/SimulationTraining.tsx` — **New**
- `src/pages/UniversityPage.tsx` — Update import and usage
- `supabase/functions/auto-train/index.ts` — Trivial edit to trigger redeploy
- `src/components/SimulationTrainingPanel.tsx` — **Delete** (replaced)

