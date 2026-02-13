

## Fix Gym Agent Isolation + Add Language-Aware Voice Filter and Feedback

### Problem 1: Gym Data Bleeds Between Agents
When you switch agents in the Gym, the current contact result, trend chart, and history don't reset -- so you see data from the previously selected agent until the new data loads. The root cause is in `GymPage.tsx`: when `agentId` changes, the state variables `contact`, `testRunId`, `trendData`, `history`, and `selectedHistoryId` are never cleared.

### Problem 2: No Language Filter on Voices + Feedback Language
Voices should be filterable by language (e.g., show only Spanish voices for a Spanish agent). Additionally, if an agent's language is set to Spanish, all evaluation feedback, suggestions, and improvement text from the AI should come back in Spanish -- unless the user explicitly switches to English.

---

### Changes

**1. Fix Gym Agent Isolation** (`src/pages/GymPage.tsx`)
- Add a reset effect that fires when `agentId` changes: clear `contact`, `testRunId`, `trendData`, `history`, `selectedHistoryId`, `appliedFixes`, and remove `testRunId` from URL params
- This ensures switching agents shows a clean slate while new data loads

**2. Add Language to Voice Data** (`supabase/functions/list-bland-voices/index.ts` + `src/hooks/useBlandVoices.ts`)
- Extract the `language` field from Bland's voice API response (Bland returns language metadata per voice)
- Add `language?: string` to the `BlandVoice` interface

**3. Add Language Filter to VoiceSelector** (`src/components/VoiceSelector.tsx`)
- Add a language filter dropdown above the search bar
- Options: "All Languages", "English", "Spanish", and any other languages detected from the voice list
- Auto-detect available languages from the loaded voices
- When a language is selected, filter the voice grid to only show matching voices

**4. Language-Aware Evaluation** (`supabase/functions/evaluate-call/index.ts`)
- Read `spec.language` from the agent spec (already fetched)
- If `language` is not "en" / "english", append an instruction to the system prompt telling the AI to write ALL feedback text (issues, suggestions, improvements, knowledge gaps) in that language
- Example addition: "IMPORTANT: The agent operates in Spanish. Write ALL evaluation text, suggestions, and improvement descriptions in Spanish."

**5. Language Toggle in Gym** (`src/pages/GymPage.tsx`)
- When viewing results for a non-English agent, show a small "EN / ES" toggle above the result card
- Default to the agent's language
- When toggled to English, re-render the evaluation text labels in English (the scores are numbers so they stay the same; this toggle would mainly be informational context for the UI labels)
- This is a lightweight UI hint -- the core language behavior comes from the evaluation prompt

---

### Files Modified
- `src/pages/GymPage.tsx` -- Reset state on agent switch; add language toggle for non-English agents
- `src/components/VoiceSelector.tsx` -- Add language filter dropdown
- `src/hooks/useBlandVoices.ts` -- Include `language` field in voice data
- `supabase/functions/list-bland-voices/index.ts` -- Pass through language metadata from Bland API
- `supabase/functions/evaluate-call/index.ts` -- Add language-aware prompt instructions

### No Database Changes Needed
The `agent_specs.language` column already exists and stores the agent's language (e.g., "es", "en").

