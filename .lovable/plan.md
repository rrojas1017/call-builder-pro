

## Remove Live Call Mode from AI Simulation Training

The AI Simulation Training component currently offers three training modes: "Simulate Only", "Hybrid", and "Live Calls Only". Since live call testing already exists separately on the University page, having it here creates confusion.

### Changes

**File: `src/components/SimulationTraining.tsx`**

1. **Remove the mode selector entirely** — Lock mode to `"simulate"` and remove the `<Select>` dropdown (lines ~303-311) that lets users choose between simulate/hybrid/live. The state initialization already defaults to `"simulate"`, so just remove the UI control and the `hybrid`/`live` options.

2. **Remove the two `<SelectItem>` entries** for "Hybrid" and "Live Calls Only" (lines 308-309), and remove the surrounding `<Select>` wrapper since "Simulate Only" is the only option left — no dropdown needed.

3. **Update description text** (line 273): Change from mentioning "Live Practice" distinction to just describing AI-vs-AI training rounds.

The "Live Practice" tab (the real-time chat tab at line 295-297) is a different feature — it's AI-vs-AI simulation watched in real-time, not actual phone calls. That tab should remain. Only the mode dropdown offering "Live Calls Only" and "Hybrid" (which use real phone numbers via Retell) needs to be removed.

