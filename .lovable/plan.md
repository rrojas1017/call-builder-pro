

# Improve Call Voice Quality and Reduce Robotic Sound

## Problem
Calls sound robotic and pacing feels unnatural. The current Bland API payload only sends `voice` and `model` but misses several key parameters that control naturalness, pacing, and pronunciation.

## Solution
Add Bland AI voice tuning parameters to the call payload and expose them in the agent settings UI so users can dial in the right sound per agent.

## Changes

### 1. Add voice tuning columns to `agent_specs`
New nullable columns:
- `temperature` (numeric, default 0.7) -- controls creativity/variability in responses (lower = more predictable, higher = more natural/varied)
- `interruption_threshold` (integer, default 100) -- how patient the AI is before speaking (higher = waits longer, less robotic interruptions)
- `pronunciation_guide` (jsonb, default null) -- array of word/pronunciation pairs for commonly mispronounced terms
- `speaking_speed` (numeric, default 1.0) -- speech rate multiplier

### 2. Update `run-test-run/index.ts` Bland payload
Pass these new parameters to the Bland API:
- `temperature` from spec (default 0.7)
- `interruption_threshold` from spec (default 100)
- `pronunciation_guide` from spec (default empty)
- `noise_cancellation: true` (always on per Bland best practices)
- Keep `model: "base"` (best for natural delivery)

### 3. Add Voice Tuning UI on CreateAgentPage
On the Review step, alongside the existing voice picker, add:
- **Temperature slider** (0.0 - 1.0) with labels "Predictable" to "Natural/Varied"
- **Interruption Threshold slider** (50 - 300) with labels "Quick response" to "Patient listener"
- **Speaking Speed slider** (0.7 - 1.2)
- **Pronunciation Guide** -- a simple table where users can add word/pronunciation pairs (e.g., "ACA" -> "A-C-A")

All sliders save to the `agent_specs` table and are read by the edge function at call time.

### 4. Auto-suggest voice settings from evaluation
When the evaluate-call function detects delivery issues (low naturalness score), include voice tuning recommendations in the `recommended_improvements` output. For example:
- If repeated words detected, suggest lowering temperature
- If rushed pacing detected, suggest lowering speaking speed
- If mispronunciations detected, suggest adding pronunciation guide entries

This connects the existing "Apply Fix" flow to automatically tune these new parameters.

## Technical Details

- Bland API `temperature` (0-1): Controls how creative/varied the AI responses are. Default 0.7 is a good balance.
- Bland API `interruption_threshold` (ms): How long the AI waits before responding. Higher values = fewer awkward interruptions. Default 100.
- Bland API `pronunciation_guide`: Array of `{ word: string, pronunciation: string }` objects for custom pronunciations.
- Bland API `noise_cancellation`: Boolean, reduces background noise artifacts.
- No new API keys needed -- these are all existing Bland API parameters.
- The evaluation prompt already scores naturalness; we just need it to map delivery issues to specific voice parameter suggestions.

