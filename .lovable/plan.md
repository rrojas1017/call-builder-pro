

# Expand Edit Agent Page + Prioritize MiniMax Voices + AI Script Builder

## Problem Summary

1. **Edit page is incomplete** — Missing ~15 configurable fields that exist at creation time: language, agent mode, must_collect_fields, qualification/disqualification rules, disclosure settings, consent, success_definition, speaking speed, temperature, interruption threshold, business hours, retry policy, SMS toggle, and no way to re-ingest knowledge or edit the raw spec.

2. **Voice sorting** — MiniMax voices (English-only, high quality) aren't prioritized in the voice list despite sounding better than most alternatives.

3. **No script builder** — Users have no tool to generate or refine agent scripts/opening lines using AI best practices.

## Plan

### 1. Expand EditAgentPage with all missing fields

Add the following sections to `src/pages/EditAgentPage.tsx`, loading and saving these fields from `agent_specs`:

- **Language & Mode** section — language picker (same 6-language chips from create), mode selector (outbound/inbound/hybrid)
- **Conversation Flow** section — `must_collect_fields` as a tag-style editable list, `success_definition` textarea
- **Qualification Rules** section — JSON editor or simplified key-value UI for `qualification_rules` and `disqualification_rules`
- **Compliance** section — `consent_required` toggle, `disclosure_required` toggle, `disclosure_text` textarea
- **Voice Tuning** section — `speaking_speed` slider (0.5-2.0), `temperature` slider (0-1), `interruption_threshold` slider (0-500)
- **Business Hours** section — day checkboxes, start/end time pickers, timezone select
- **SMS** toggle — `sms_enabled` switch
- **Advanced** collapsible — raw spec JSON editor (same as create page)

Update the `handleSave` function to persist all new fields. Update the initial `load` query to fetch all these columns.

### 2. Prioritize MiniMax voices in VoiceSelector

In `src/components/VoiceSelector.tsx`, add sorting logic to the `filtered` memo so voices with names starting with "minimax-" or description containing "minimax" appear first in the preset list (after the pinned selected voice). This keeps MiniMax's high-quality English voices at the top without removing any existing voices.

### 3. AI Script Builder

Create a new component `src/components/ScriptBuilder.tsx` and a new edge function `supabase/functions/generate-script/index.ts`:

**Edge function** — Takes `project_id`, current spec fields (persona_name, use_case, language, tone_style, must_collect_fields, opening_line), and a user prompt. Uses Lovable AI (Gemini Flash) to generate an optimized opening line and full conversation script following best practices (natural pacing, disclosure timing, objection handling, field collection order). Returns structured output via tool calling.

**Component** — A dialog/panel accessible from both Create and Edit pages with:
- "Generate Opening Line" button that produces a best-practice opening line based on agent config
- "Build Full Script" button that generates a complete conversation flow guide
- Preview pane showing the generated script
- "Apply" button to push the opening line and tone back into the form

Embed the ScriptBuilder in EditAgentPage's Script section and optionally in CreateAgentPage step 2.

### Files Changed

- **`src/pages/EditAgentPage.tsx`** — Add all missing field sections, expand load/save queries
- **`src/components/VoiceSelector.tsx`** — Add MiniMax-first sorting
- **`src/components/ScriptBuilder.tsx`** — New AI script builder component
- **`supabase/functions/generate-script/index.ts`** — New edge function for AI script generation
- **`supabase/config.toml`** — Add `generate-script` function config

No database changes needed — all fields already exist in `agent_specs`.

