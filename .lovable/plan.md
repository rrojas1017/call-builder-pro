

# Feedback Loop Audit: Are We Capturing Everything?

I traced every suggestion type through the entire pipeline. Here's a complete map of what's flowing back and what's falling through the cracks.

## What's Working

| Suggestion Type | Saved? | Fed Back Into Agent? |
|---|---|---|
| `humanness_suggestions` | Yes → `humanization_notes` + `global_human_behaviors` | Yes, auto-applied every evaluation |
| `winning_patterns` (learn-from-success) | Yes → `agent_knowledge` | Yes, included in briefings |
| Research entries (research-and-improve) | Yes → `agent_knowledge` + `humanization_notes` | Yes, auto-applied |
| `recommended_improvements` | Yes → `evaluations.recommended_fixes` | Only when user clicks "Apply" |
| `issues_detected` | Yes → `evaluations.issues` | Passed to research as context |

## What's NOT Working (Gaps Found)

### 1. `knowledge_gaps` are never persisted
This is the biggest gap. The evaluator detects specific topics the agent couldn't answer (e.g., "couldn't explain net metering", "didn't know about federal tax credit eligibility"). These get:
- Passed to `research-and-improve` as Firecrawl search queries
- But if the search returns nothing useful, **the gaps vanish** — they're never saved to `agent_knowledge` or any tracking table
- There's no way to see historically what the agent didn't know

### 2. `delivery_issues` are stored but never acted on
Voice quality problems (mispronounced words, robotic cadence, repeated phrases) are detected and stored in the evaluation rubric, but no automated action is taken. The evaluator already generates voice tuning recommendations (lower temperature, adjust speaking speed, add pronunciation guide entries), but these sit in `recommended_improvements` waiting for manual clicks.

### 3. `recommended_improvements` with severity "critical" aren't auto-applied
Even critical fixes (compliance violations, call-blocking issues) require manual user action. The system could auto-apply critical-severity improvements the same way it auto-applies humanness suggestions.

## Proposed Fix

### File: `supabase/functions/evaluate-call/index.ts`

**Change 1: Persist knowledge gaps to `agent_knowledge`**
After the existing humanness auto-apply block (~line 473), add logic to save `knowledge_gaps` as `agent_knowledge` entries with category `"knowledge_gap"`, deduplicating against existing entries. This ensures gaps are tracked even when research finds nothing, and they'll be included in future briefings.

**Change 2: Auto-apply critical-severity improvements**
After evaluation completes, loop through `recommended_improvements` where `severity === "critical"`, and call `apply-improvement` for each one. This mirrors the humanness auto-apply pattern but only for the most impactful fixes.

### No schema changes needed
The `agent_knowledge` table already supports arbitrary categories via its `category` text column, and `buildTaskPrompt` already loads all knowledge entries regardless of category.

## Technical Details

```text
evaluate-call pipeline (current):
  transcript → AI evaluation → store scores
    ├── humanness_suggestions → auto-apply to humanization_notes ✅
    ├── humanness_suggestions → save to global_human_behaviors ✅  
    ├── knowledge_gaps → pass to research-and-improve (search only) ⚠️
    ├── recommended_improvements → store, wait for manual apply ⚠️
    └── delivery_issues → store only ⚠️

evaluate-call pipeline (proposed):
  transcript → AI evaluation → store scores
    ├── humanness_suggestions → auto-apply to humanization_notes ✅
    ├── humanness_suggestions → save to global_human_behaviors ✅
    ├── knowledge_gaps → SAVE to agent_knowledge + pass to research ✅ NEW
    ├── recommended_improvements (critical) → AUTO-APPLY ✅ NEW
    ├── recommended_improvements (non-critical) → store, wait for manual ✅
    └── delivery_issues → store only (unchanged)
```

