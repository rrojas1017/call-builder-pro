

# Add Personality Traits Configuration to Agent Creation Wizard & Edit Page

## Current State

The agent personality is currently controlled by two fields in `agent_specs`:
- **`tone_style`** — a free-text input ("friendly, professional, casual") shown in Edit page only
- **`humanization_notes`** — a JSON array of behavioral directives stored in the DB but **never exposed in the UI**. It's only populated by the AI via `save-wizard-answers` and `apply-improvement` functions, and consumed by `buildTaskPrompt` to generate the agent's interaction style.

Neither the creation wizard nor the edit page lets users explicitly define personality traits like "empathetic", "assertive", "humorous", "patient", etc.

## Plan

### 1. Add a Personality Traits selector to the Creation Wizard (Step 2 — Review & Save)

Add a new "Personality & Style" card in Step 2 with:
- **Preset trait chips** — clickable badges for common traits: Empathetic, Assertive, Patient, Humorous, Warm, Direct, Enthusiastic, Calm, Persuasive, Casual, Formal, Energetic
- **Custom trait input** — a text field to add custom traits not in the preset list
- Selected traits get stored into `humanization_notes` as behavioral directives (e.g. selecting "Empathetic" becomes "Be empathetic — acknowledge the caller's feelings and concerns before moving forward")

### 2. Add the same Personality Traits section to the Edit Agent page

Add a new "Personality Traits" card in the Script section of `EditAgentPage.tsx`:
- Same chip-based selector with preset traits + custom input
- Loads existing `humanization_notes` from the spec on mount
- Allows adding/removing traits visually
- Saves back to `humanization_notes` on save

### 3. Map traits to actionable directives

Create a mapping in a shared utility that converts short trait labels into behavioral instructions for the prompt engine:

```text
Empathetic → "Be empathetic — acknowledge the caller's feelings and validate concerns before continuing"
Assertive → "Be confidently assertive — guide the conversation with clear direction"
Patient → "Be patient — never rush the caller, allow pauses and repeat information if needed"
Humorous → "Use light, appropriate humor to build rapport — but never at the caller's expense"
...etc
```

This ensures `buildTaskPrompt`'s existing `buildCompactStyle(humanizationNotes)` function produces high-quality agent behavior from simple user selections.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/personalityTraits.ts` | **New** — trait label → directive mapping, preset trait list |
| `src/pages/CreateAgentPage.tsx` | Add personality trait selector in Step 2 (Review & Save) |
| `src/pages/EditAgentPage.tsx` | Add personality trait section, load/save `humanization_notes` |

No database changes needed — `humanization_notes` (JSON array) already exists in `agent_specs`.

