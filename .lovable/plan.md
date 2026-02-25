

# Fix Inbound ACA Agent: Reading Off Instructions

## Problem

The inbound ACA agent sounds like it's reading off instructions because **the Custom LLM WebSocket receives almost no useful prompt for inbound calls**.

Here's what happens today:
1. An inbound call arrives and Retell connects to the `retell-llm-ws` WebSocket
2. The WebSocket tries to load a prompt from `test_runs.agent_instructions_text` — but inbound calls have no test run, so this fails
3. It falls back to building a trivial one-liner: `"You are Sofia. Be friendly and professional. Purpose: ACA qualification."`
4. The agent has no knowledge of collection fields, pacing rules, disclosure text, qualification logic, or conversational style — so the LLM improvises poorly, likely echoing whatever fragments it can find from the Retell LLM's `general_prompt` field (which the Custom LLM WebSocket architecture ignores)

Meanwhile, outbound calls work fine because `run-test-run` and `tick-campaign` both call `buildTaskPrompt()` and inject the full prompt before each call.

## Solution

Update the WebSocket handler (`retell-llm-ws`) to build the **full task prompt** for inbound calls using the same `buildTaskPrompt()` function that outbound calls use.

## Technical Details

### File: `supabase/functions/retell-llm-ws/index.ts`

**Changes:**

1. **Import `buildTaskPrompt`** from the shared module (`../_shared/buildTaskPrompt.ts`)

2. **Replace the trivial fallback** (line ~133):
   ```
   // Current: bare one-liner
   systemPrompt = `You are ${spec.persona_name}...`
   
   // New: full prompt with knowledge + briefing
   ```

3. **Load knowledge entries and briefing** when building the prompt for non-test-run calls:
   - Query `agent_knowledge` for the project's knowledge entries
   - Query `agent_specs.knowledge_briefing` (if it exists) for the pre-summarized briefing
   - Call `buildTaskPrompt(spec, knowledgeEntries, briefing, callerName)` to generate the complete prompt

4. **Also check `calls.agent_instructions_text`** as a secondary source — if a pre-built prompt was stored on the call record during `call_started`, use that instead of rebuilding.

This ensures inbound calls get the exact same rich, conversational prompt that outbound calls receive — including pacing rules, disclosure handling, field collection order, FPL qualification logic, and humanization notes.

