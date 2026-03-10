

# Add AI Training UI to University Page

## Overview
Add a new "AI Simulation Training" section to the University page that lets users run the `auto-train` function in simulate mode directly from the UI, with configuration options and real-time progress display.

## Changes

### 1. New Component: `src/components/SimulationTrainingPanel.tsx`
A collapsible panel added to the University page (below the test call form, before the trend chart) with:

**Configuration form:**
- Difficulty selector: easy / medium / hard / mixed (radio group or select)
- Number of rounds: slider or select (1-5, default 3)
- Calls per round: slider or select (1-5, default 3)
- Mode selector: Simulate (default) / Hybrid (shows threshold input when selected)

**Run button:** "Start AI Training" — invokes `auto-train` with `mode: "simulate"` (or hybrid)

**Progress display** (shown while running):
- Current round indicator (e.g., "Round 2 of 3")
- Per-round results as they come in: score, fixes applied, status badges (completed / regression_rollback / etc.)
- Final summary: score progression, total fixes applied

**State management:**
- Uses `supabase.functions.invoke('auto-train', ...)` — single long-running call
- Shows a loading/progress state while waiting for the response
- On completion, refreshes the trend chart and history data
- Disables the panel while a live test call is running (and vice versa)

### 2. Modify `src/pages/UniversityPage.tsx`
- Import and render `SimulationTrainingPanel` after the test call form section (around line 580)
- Pass `agentId` and a callback to refresh history/trend data after training completes
- Gate visibility: only show when an agent is selected

## UI Layout (in University page order)
```text
┌─────────────────────────────────┐
│ Graduation Badge                │
│ Summary Stats                   │
│ Agent Select + Phone + Run Test │
│ Live Call Monitor               │
│ ┌─────────────────────────────┐ │  ← NEW
│ │ ⚡ AI Simulation Training   │ │
│ │ Difficulty: [easy|med|hard] │ │
│ │ Rounds: [3]  Calls/round:[3]│ │
│ │ [▶ Start AI Training]       │ │
│ │                             │ │
│ │ Round 1: ✓ Score 7.2 (+0.4) │ │
│ │ Round 2: ✓ Score 7.8 (+0.6) │ │
│ │ Round 3: ⏳ Running...       │ │
│ └─────────────────────────────┘ │
│ Humanness Trend Chart           │
│ Results                         │
│ Call History                    │
└─────────────────────────────────┘
```

## Files
- `src/components/SimulationTrainingPanel.tsx` — **New**
- `src/pages/UniversityPage.tsx` — Add import and render the panel

