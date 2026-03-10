

# Merge Training + Live Chat into One Unified Section

## Problem
Right now the University page shows **two separate blocks** stacked vertically:
1. **SimulationTraining** — "Start 3-Round Training" + "Test 1 Call"
2. **LiveSimulationChat** — "Start" / "Restart"

Both do essentially the same thing (run AI-vs-AI simulations) but with different UIs. It's confusing which to use.

## Solution
Combine them into **one component with tabs**:

```text
┌─────────────────────────────────────┐
│  AI Simulation Training             │
│  ┌──────────┐ ┌──────────────────┐  │
│  │ Training │ │ Live Practice    │  │
│  └──────────┘ └──────────────────┘  │
│                                     │
│  [Tab content here]                 │
└─────────────────────────────────────┘
```

- **Training tab** — Multi-round scored training (current SimulationTraining: rounds slider, calls-per-round, difficulty, progress bar, round results)
- **Live Practice tab** — Watch a single conversation unfold in real-time with typing indicators (current LiveSimulationChat)

One section, one set of shared controls (difficulty selector), two modes via tabs.

## Changes

### `src/components/SimulationTraining.tsx`
- Add a tab bar at the top: "Training" | "Live Practice"
- **Training tab**: Keep existing multi-round training UI (config sliders, start button, results)
- **Live Practice tab**: Embed the LiveSimulationChat component inline
- Share the difficulty selector between both tabs
- Only one action can run at a time (disable the other tab's controls when active)

### `src/pages/UniversityPage.tsx`
- Remove the separate `<LiveSimulationChat>` render block (lines 603-606)
- Keep only `<SimulationTraining>` which now contains both modes

### `src/components/LiveSimulationChat.tsx`
- Add optional `difficulty` prop so the parent can pass it in
- Keep component as-is otherwise (it works well standalone)

## Files
- `src/components/SimulationTraining.tsx` — Add tabs, embed LiveSimulationChat
- `src/components/LiveSimulationChat.tsx` — Add `difficulty` prop
- `src/pages/UniversityPage.tsx` — Remove standalone LiveSimulationChat

