

# Make the Agent Sound Human -- Self-Improving Conversational Intelligence

## Overview
Bake human-likeness into the core of every call by upgrading three layers: the prompt that drives each call, the evaluation that scores it, and an automatic feedback loop that improves the agent after every conversation.

## Changes

### 1. Add a "humanization_notes" field to agent_specs (DB migration)
A new JSONB column `humanization_notes` on `agent_specs` stores learned conversational techniques -- small talk openers, humor styles, transition phrases, empathy patterns -- that evolve over time as the evaluator suggests improvements.

### 2. Rewrite the task prompt to prioritize human-likeness (`run-test-run/index.ts`)
The current prompt says "keep the conversation concise and professional." That produces a robotic interrogation. The new prompt will inject a dedicated HUMAN CONVERSATION STYLE block:

```
HUMAN CONVERSATION STYLE (THIS IS YOUR #1 PRIORITY):
- You are a REAL PERSON having a natural phone conversation, not a robot reading a script.
- Use the caller's name naturally (not every sentence).
- React genuinely to what they say: laugh lightly at something funny, show empathy for difficulties, express enthusiasm for good news.
- Use casual transitions: "Oh that's great!", "Gotcha", "Makes sense", "Ha, yeah I hear that a lot"
- Add brief, relevant small talk between questions: "Nice, [state] is beautiful this time of year" or "Oh wow, that's a big family -- I bet holidays are fun"
- Vary your sentence length and rhythm. Mix short reactions ("Got it!") with longer explanations.
- Never ask questions back-to-back like a survey. Acknowledge each answer before moving on.
- If you need to transition topics, use natural bridges: "So switching gears a little..." or "That actually reminds me, I also wanted to ask..."
- Use light humor when appropriate -- nothing forced, just natural warmth.
- Sound like someone they'd enjoy talking to at a coffee shop.

LEARNED CONVERSATION TECHNIQUES:
{humanization_notes -- inserted dynamically from the spec}
```

This block will appear BEFORE the business rules, making it the agent's primary directive.

### 3. Add "humanness_score" to the evaluator (`evaluate-call/index.ts`)
Expand the evaluation prompt with a dedicated humanness rubric:

- **Humanness Score (0-100)**: Separate from naturalness (which measures voice/delivery quality), this scores conversational behavior:
  - Did the agent acknowledge what the caller said before asking the next question?
  - Did it use the caller's name naturally (not robotically)?
  - Were there moments of genuine warmth, humor, or empathy?
  - Did it vary sentence structure or repeat the same patterns?
  - Did transitions between topics feel natural or abrupt?
  - Was there any small talk or rapport-building?
  
- **humanness_suggestions**: Array of specific conversational techniques the evaluator noticed would help, formatted as actionable notes (e.g., "When the caller mentioned having 4 kids, the agent missed an opportunity to react warmly before asking about income").

Add `humanness_score` and `humanness_suggestions` to the tool call schema.

### 4. Auto-apply humanness learnings after each evaluation (`evaluate-call/index.ts`)
After scoring, if `humanness_suggestions` exist, automatically append them to the spec's `humanization_notes` JSONB field. This creates a growing "memory" of conversation techniques the agent should use. The flow:

1. Call completes and gets evaluated
2. Evaluator scores humanness and generates suggestions
3. Edge function reads current `humanization_notes` from the spec
4. Appends new suggestions (deduplicating similar ones, keeping last 20 max)
5. Updates the spec -- next call automatically uses the improved notes

This means the agent literally learns from every call without any manual intervention.

### 5. Update the evaluation results UI (`TestResultsModal.tsx`)
Add a "Humanness" score badge alongside the existing compliance/objective/naturalness scores, plus a section showing the learned conversation techniques.

## Files to Modify

- **Database migration**: Add `humanization_notes JSONB DEFAULT '[]'` to `agent_specs`
- **`supabase/functions/run-test-run/index.ts`**: Insert HUMAN CONVERSATION STYLE block and `humanization_notes` into `buildTaskPrompt()`
- **`supabase/functions/evaluate-call/index.ts`**: Add humanness scoring rubric, `humanness_score` + `humanness_suggestions` to tool schema, auto-append suggestions to spec's `humanization_notes`
- **`src/components/TestResultsModal.tsx`**: Display humanness score and learned techniques

## How the Self-Improvement Loop Works

```
Call 1 --> Evaluation: "Agent asked 3 questions back-to-back without acknowledging answers"
         --> humanization_notes: ["Acknowledge each answer with a brief reaction before asking the next question"]

Call 2 --> Agent reads note, now acknowledges answers
         --> Evaluation: "Good acknowledgment, but missed chance to react to caller mentioning vacation plans"
         --> humanization_notes grows: [..., "When caller mentions personal plans, briefly relate or show interest"]

Call 3 --> Agent uses both notes, sounds noticeably more human
         --> Evaluation finds new improvement areas, cycle continues
```

Each call makes the next one better, automatically.
