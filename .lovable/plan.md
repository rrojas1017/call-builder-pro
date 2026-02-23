

# Retell Integration Optimization with Gemini 3 Pro

## Overview

Use `google/gemini-3-pro-preview` (the closest available model to what you're asking for) to analyze Retell's API documentation and generate optimized agent configurations. This will create a new "Retell Optimization" edge function that acts as an AI-powered integration advisor, plus apply concrete improvements across existing functions.

## What We'll Build

### 1. New Edge Function: `optimize-retell-agent`

An AI-powered function that uses Gemini 3 Pro to:
- Accept an agent's current spec and Retell config
- Analyze it against Retell best practices (from the docs we just reviewed)
- Return optimized configuration recommendations
- Auto-apply approved optimizations

### 2. Improvements Based on Retell API Docs Analysis

After reviewing the Retell docs thoroughly, here are the concrete integration gaps to fix:

**A. Agent Creation (`manage-retell-agent`) -- Missing features:**
- `enable_voicemail_detection: true` (currently not set)
- `voicemail_message` from spec (currently not passed)
- `enable_backchannel: true` for natural conversations
- `backchannel_words` for human-like engagement
- `responsiveness` mapped from spec settings
- `interruption_sensitivity` mapped from spec's `interruption_threshold`
- `ambient_sound` option (e.g., "call-center" for realism)
- `boosted_keywords` from agent knowledge (names, brands, key terms)
- `normalize_for_speech: true` for consistent number/date reading
- `enable_dynamic_voice_speed: true` for natural pacing
- `pronunciation_dictionary` from spec's `pronunciation_guide`
- `end_call_after_silence_ms` configurable
- `max_call_duration_ms` configurable
- `post_call_analysis_model` upgrade option
- `analysis_summary_prompt` and `analysis_successful_prompt` custom prompts

**B. LLM Configuration -- Missing features:**
- `model` selection (currently defaults to gpt-4.1, could use `gemini-3.0-flash` or `gpt-5`)
- `model_temperature` from spec's `temperature` field
- `model_high_priority` option for important campaigns
- `begin_message` from spec's `opening_line`
- `start_speaker: "agent"` for outbound calls
- `general_tools` with `end_call` and `transfer_call` tools built-in
- `states` for multi-step conversation flows (qualification -> transfer)

**C. Webhook (`receive-retell-webhook`) -- Missing events:**
- `call_started` event handling for real-time monitoring
- `transfer_started`, `transfer_bridged`, `transfer_ended` events
- `transcript_updated` for live call monitoring

### 3. Update the Shared AI Client

Add `google/gemini-3-pro-preview` as an available model option and update the default for high-reasoning tasks.

## Technical Plan

### Step 1: Create `optimize-retell-agent` Edge Function

This function will:
1. Accept a `project_id`
2. Load the agent spec, current Retell config, and knowledge base
3. Send everything to Gemini 3 Pro with Retell API documentation context
4. Return structured optimization recommendations using tool calling
5. Optionally auto-apply the recommendations via Retell API

### Step 2: Enhance `manage-retell-agent`

Update the `create` and `update` actions to pass all the missing Retell parameters from the agent spec:

- Map `spec.voicemail_message` to agent's `voicemail_message` + enable detection
- Map `spec.interruption_threshold` (0-100 scale) to Retell's `interruption_sensitivity` (0-1 scale)
- Map `spec.speaking_speed` to `voice_speed`
- Map `spec.temperature` to LLM's `model_temperature`
- Map `spec.opening_line` to LLM's `begin_message`
- Map `spec.pronunciation_guide` to agent's `pronunciation_dictionary`
- Add `general_tools` with `end_call` and conditional `transfer_call`
- Add `states` for structured conversation flow (opening -> qualification -> transfer/close)
- Set `normalize_for_speech: true`
- Set `enable_backchannel: true`
- Set `enable_dynamic_voice_speed: true`
- Set `start_speaker: "agent"` for outbound

### Step 3: Enhance `receive-retell-webhook`

- Handle `call_started` event (update call status to "in_progress" for live monitoring)
- Handle `transfer_started`/`transfer_ended` events (track transfer success rate)

### Step 4: Update Default AI Models

- Update `_shared/ai-client.ts` default Gemini model to `google/gemini-3-pro-preview`
- Use Gemini 3 Pro for the optimization function
- Keep Claude Sonnet 4 for call evaluation (per existing architecture strategy)

### Step 5: Add UI for Optimization

- Add an "Optimize with AI" button on the Edit Agent page
- Show recommendations in a modal with approve/reject per item
- Display which Retell features are currently enabled vs. available

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/optimize-retell-agent/index.ts` | Create new |
| `supabase/functions/manage-retell-agent/index.ts` | Enhance with all missing Retell params |
| `supabase/functions/receive-retell-webhook/index.ts` | Add new event handlers |
| `supabase/functions/_shared/ai-client.ts` | Update default model |
| `src/pages/EditAgentPage.tsx` | Add optimization button + modal |
| `src/hooks/useRetellAgent.ts` | Add optimize action |

## Key Model Clarification

- **"Gemini 3.1 Pro" does not exist.** The closest options are:
  - `google/gemini-3-pro-preview` -- Available via Lovable AI for your backend processing
  - `gemini-3.0-flash` -- Available directly within Retell's LLM engine for the agent's real-time conversation model

