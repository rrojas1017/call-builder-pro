

# Verbal Training Feedback Extraction from Test Calls

## What We're Building

Two things:

1. **A "verbal feedback detector"** added to the `evaluate-call` edge function that specifically scans test call transcripts for explicit training instructions from the caller (e.g., "you should say X instead", "try being more casual", "don't mention pricing so early") and auto-applies them as agent improvements.

2. **A "How to Train Your Agent" instruction panel** in the Test Lab UI that teaches users how to verbally coach the agent during test calls.

## Changes

### 1. Update `evaluate-call` Edge Function (~lines 440-550)

Add a new section after the existing evaluation that runs **only for test calls** (`test_run_contact_id` is present). This section:

- Sends the transcript to AI with a focused prompt: "Extract any explicit verbal training feedback the caller gave the AI agent. Look for phrases like 'you should...', 'don't say...', 'try saying...', 'next time...', 'instead of...', 'be more/less...'"
- Uses tool calling to return structured output: `{ training_feedback: [{ instruction: string, target_field: string, suggested_change: string, confidence: "high"|"medium"|"low" }] }`
- For high-confidence feedback, auto-applies via `apply-improvement` (same as critical fixes)
- For medium/low confidence, stores them in the evaluation result so users can review and apply manually
- Tags applied improvements with `source: "verbal_training"` for tracking

The AI prompt maps verbal instructions to spec fields:
- Tone/personality feedback → `tone_style`
- "Say X instead of Y" → `opening_line` or `business_rules`
- "Don't ask about X" / "Ask about Y" → `must_collect_fields`
- "Be more/less..." → `humanization_notes`
- Product knowledge corrections → `agent_knowledge` entries

### 2. Add Training Instructions Panel to `TestLabSection.tsx`

Add a collapsible "How to Train Your Agent" card above the test call form. Contains:

- A brief intro: "During test calls, you can verbally coach your agent. The system will extract your feedback and apply it automatically."
- Bullet-pointed examples of what to say:
  - "You should be more casual when greeting people"
  - "Don't ask about their income so early in the conversation"
  - "When someone asks about pricing, mention the free trial first"
  - "Try saying 'I'd love to help' instead of 'I can assist you'"
  - "You need to slow down between questions"
- A tip: "Speak naturally — the AI understands context. Just tell the agent what to do differently as if you were coaching a new employee."
- An icon badge: "Verbal Training Enabled" indicator

### 3. Show Extracted Feedback in `TestResultsModal.tsx`

Add a "Verbal Training Feedback" section in the test results that shows:
- Each extracted instruction with its target field
- Whether it was auto-applied or needs manual approval
- An "Apply" button for non-auto-applied feedback

### Files Changed
- `supabase/functions/evaluate-call/index.ts` — add verbal feedback extraction for test calls
- `src/components/TestLabSection.tsx` — add training instructions panel
- `src/components/TestResultsModal.tsx` — show extracted verbal feedback section

