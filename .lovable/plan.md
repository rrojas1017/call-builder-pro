

# Overhaul Agent Creation Pipeline -- Fix Name/Placeholder Bugs and Add AI Assistant

## Problems Found

### 1. Critical Bug: `begin_message` sent to Retell with raw `{{first_name}}` placeholder
In `run-test-run/index.ts` (line 242), the `begin_message` sent to Retell only resolves `{{agent_name}}` but **never** resolves `{{first_name}}`. Retell then literally speaks "Hey curly-brace-curly-brace first underscore name" or "client name" on the call.

The `begin_message` is a **static field on the LLM** -- it's spoken before any dynamic variables are evaluated. So `{{first_name}}` can't work here unless Retell's `retell_llm_dynamic_variables` are used, but the `begin_message` field doesn't support them in template form the way we're sending them.

### 2. Critical Bug: Missing `res` variable in `manage-retell-agent`
In `manage-retell-agent/index.ts` line 246, the code references `res.json()` but `res` was never declared -- the `fetch` call to create the agent is missing. The agent creation action is broken at the code level (the `const res = await fetch(...)` line is absent between building the body and reading the response).

### 3. Wizard answers pre-populated but hidden
When `generate-spec` returns wizard questions, the answers are set to `suggested_default` on the backend, but on the frontend (line 371-374), the code clears them: `answer: ""` and stores `suggested_default` separately. The user sees empty textareas and has to either type or click "Review Defaults." If they click "Confirm" without answering, empty strings go to `save-wizard-answers`, which skips them entirely.

### 4. No AI assistance during the wizard
Users can't ask for AI help to fill in wizard answers. There's a `knowledge-wizard` function but it's only for post-ingestion knowledge refinement, not for the creation wizard.

### 5. Opening line sent to both `general_prompt` AND `begin_message`
The opening line appears twice: once in the task prompt as "OPENING GUIDE" (with placeholders partially resolved) and again as `begin_message` on the LLM (with only `{{agent_name}}` resolved). This causes the agent to potentially speak the opening twice or get confused.

## Solution

### Fix 1: Resolve `begin_message` properly (run-test-run + tick-campaign)
- When building `begin_message` for Retell, resolve BOTH `{{agent_name}}` AND `{{first_name}}` placeholders.
- Since `begin_message` is set once per LLM (not per call), and `{{first_name}}` varies per contact, the `begin_message` should use a **generic greeting** that doesn't include the caller's name. The caller-name-specific greeting goes into `general_prompt` only.
- Change: Set `begin_message` to the opening line with `{{agent_name}}` resolved and `{{first_name}}` stripped (replaced with a natural fallback like "there" or removed entirely). The task prompt's OPENING GUIDE already handles per-contact name injection.

### Fix 2: Fix missing `fetch` in `manage-retell-agent` create action
Add the missing `const res = await fetch(...)` call between `body.is_transfer_agent = false;` (line 244) and `const data = await res.json();` (line 246).

### Fix 3: Pre-fill wizard answers with suggested defaults
Change the frontend (CreateAgentPage line 371) to pre-populate `answer` with `suggested_default` instead of clearing it. Users see sensible defaults they can tweak rather than empty forms.

### Fix 4: Add "AI Assist" button to each wizard question
Add a small "Suggest with AI" button next to each wizard question that invokes a lightweight AI call to generate a better answer based on:
- The agent description/source text
- The question being asked
- Any website knowledge already ingested

This reuses the existing Lovable AI gateway via a new edge function `wizard-ai-assist`.

### Fix 5: Clean up opening line duplication
- `begin_message` on the Retell LLM: resolved opening with agent name, generic caller reference (no `{{first_name}}`)
- `general_prompt` OPENING GUIDE: full template with caller name hint, clearly marked as a natural adaptation guide

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/manage-retell-agent/index.ts` | Fix missing `fetch` call in create action |
| `supabase/functions/run-test-run/index.ts` | Fix `begin_message` to strip `{{first_name}}` placeholder; resolve `{{agent_name}}` properly |
| `supabase/functions/tick-campaign/index.ts` | Same `begin_message` fix as run-test-run (if same pattern exists) |
| `supabase/functions/_shared/buildTaskPrompt.ts` | Add `resolveBeginMessage()` helper that produces a clean begin_message without `{{first_name}}` |
| `supabase/functions/wizard-ai-assist/index.ts` | **New** -- lightweight edge function that takes a question + agent context and returns a suggested answer |
| `src/pages/CreateAgentPage.tsx` | Pre-fill wizard answers with defaults; add "AI Assist" button per question; streamline Step 2 UX |

## Technical Details

### `resolveBeginMessage()` helper
```text
Input:  "Hey {{first_name}}, this is {{agent_name}} calling..."
Output: "Hey, this is Sofia calling..."
```
Strips `{{first_name}}` (and trailing comma/space), resolves `{{agent_name}}`, cleans up punctuation.

### `wizard-ai-assist` edge function
- Accepts: `{ project_id, question, current_answer, agent_description }`
- Uses Gemini 3 Flash to generate a 1-3 sentence answer
- Returns: `{ suggested_answer: string }`
- Non-streaming, fast turnaround

### CreateAgentPage wizard UX changes
- Each question card gets a small sparkle button ("AI Assist")
- Clicking it shows a loading spinner, then fills in the answer field
- Answers start pre-populated with the AI-generated defaults from `generate-spec`
- "Review Defaults" button removed (no longer needed since defaults are pre-filled)

