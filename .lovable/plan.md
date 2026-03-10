

# Fix: AI Agent Still Cutting Off Mid-Sentence

## Problem
The session replay shows the agent producing truncated responses like "Le cuento rapid" and "para conocer" — cut off mid-word. Despite sending `max_tokens: 1024` with both field names, the model is still truncating output at ~20-50 tokens.

## Root Cause
The default model `google/gemini-3-pro-preview` (a preview model) appears to not reliably honor `max_tokens` through the gateway. Preview models can have unpredictable output limits.

## Fix

### 1. `supabase/functions/simulate-turn/index.ts`
- Switch to a stable, proven model by explicitly passing `model: "google/gemini-2.5-flash"` in both the agent and customer `callAI` calls. This model is fast, reliable, and known to respect token limits.
- Increase `max_tokens` from `1024` to `2048` as additional safety margin.
- Add an explicit instruction to the agent and customer system prompts: "Always finish your sentences completely. Never stop mid-word or mid-sentence."

### 2. `supabase/functions/_shared/ai-client.ts`
- No changes needed — `max_tokens` and `max_completion_tokens` are already both sent.

## Scope
One file (`simulate-turn/index.ts`): change model, bump token limit, add anti-truncation instruction.

