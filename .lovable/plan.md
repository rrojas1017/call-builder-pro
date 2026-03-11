

# Agent Creation & Business Rules Review

## Summary

After reviewing the entire flow — from agent creation wizard (`CreateAgentPage`) through editing (`EditAgentPage`), business rule parsing (`parse-business-rules`), spec generation (`generate-spec`), and prompt building (`buildTaskPrompt`) — the system is **functioning correctly** with a few minor issues worth addressing.

## What's Working Correctly

| Area | Status |
|------|--------|
| 3-step creation wizard (Build → Clarify → Review & Save) | Working |
| Multi-language support (EN, ES, FR, PT, DE, IT) | Working |
| AI-powered spec generation via Gemini | Working |
| Wizard clarification questions with AI Assist | Working |
| Retell agent auto-provisioning (blocks save on failure) | Working |
| Voice selection with language filtering | Working |
| Opening line name guard (persona mismatch fix) | Working |
| Business rules list UI with drag-and-drop reorder | Working |
| Document upload for business rules (.docx, .pdf, .txt) | Working |
| Business rules saved as `{ rules: [] }` JSON structure | Working |
| `buildTaskPrompt` serializes rules into numbered BUSINESS RULES block | Working |
| FPL/email suppression when business rules contain relevant keywords | Working |
| Auto-sync to Retell on save | Working |

## Issues Found

### 1. CreateAgentPage: File upload doesn't invoke `parse-business-rules`
In the creation wizard (Step 0), when a user uploads a `.docx`/`.pdf`/`.txt` file, it gets uploaded to the `agent_sources` bucket and appended as `[File uploaded: filename]` to the source text. It then goes through `generate-spec` or `ingest-agent-source` — but business rules are **not extracted from the uploaded document** during creation. The `parse-business-rules` function is only used in `EditAgentPage`.

**Impact**: Business rules from uploaded documents during agent creation are not extracted into the structured rules list. They only influence the initial spec generation as general context.

### 2. CreateAgentPage: No business rules UI in the wizard
The creation wizard has no step for reviewing or editing business rules before saving. Rules only become manageable after the agent is created, on the Edit page.

**Impact**: Low — users can manage rules immediately after creation in the Edit page.

### 3. Duplicate `buildTaskPrompt.ts` files
There are two copies: `src/lib/buildTaskPrompt.ts` and `supabase/functions/_shared/buildTaskPrompt.ts`. They appear to have similar but potentially divergent logic. This is a maintenance risk.

**Impact**: Medium — any fix to one must be manually replicated in the other.

### 4. `parse-business-rules` system prompt could be stronger
The current system prompt extracts rules but doesn't explicitly instruct the AI to "translate" vague procedural language into clear agent directives. The model was upgraded to `gemini-2.5-pro` but the prompt itself wasn't enhanced (per the earlier approved plan, only the model and `max_tokens` were changed).

**Impact**: Medium — extraction quality relies heavily on the model's default behavior rather than explicit prompting.

## Recommended Fixes

### Fix 1: Enhance the `parse-business-rules` system prompt
Update the `SYSTEM_PROMPT` constant to instruct the AI to interpret intent, preserve conditional logic, and phrase rules as direct agent directives rather than raw text extraction.

### Fix 2: No code change needed for the other items
- The creation wizard file upload is intentionally general-purpose (feeds into spec generation, not structured rules).
- The duplicate `buildTaskPrompt` is an architectural choice for edge function isolation.
- Business rules management in Edit page only is acceptable UX.

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/parse-business-rules/index.ts` | Enhance the `SYSTEM_PROMPT` to produce higher-quality, agent-ready directives |

