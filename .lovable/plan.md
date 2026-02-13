

# Auto-Research to Accelerate Agent Improvement

## Overview
When the evaluator identifies weak areas (low humanness score, poor objection handling, industry-specific gaps), the system will automatically research the web for best practices and inject those learnings into the agent's knowledge -- making it smarter after every call, not just from its own mistakes but from the collective wisdom of the internet.

## How It Works

After each call evaluation, if the humanness score is below 80 or the evaluator flags specific weak areas, a new "research-and-improve" edge function kicks in:

1. Evaluator finishes scoring a call and identifies gaps (e.g., "agent didn't handle price objection well", "agent needs better small talk for insurance callers")
2. The system generates targeted search queries from those gaps + the agent's use case
3. Firecrawl searches the web for relevant best practices (sales scripts, objection handling guides, industry conversation techniques)
4. An AI pass distills the raw research into concise, actionable conversation techniques
5. The distilled techniques get merged into the agent's `humanization_notes` alongside the evaluator's own suggestions

## Changes

### 1. Connect Firecrawl to the project
The Firecrawl connector is available in the workspace but not linked to this project. We'll link it so edge functions can use `FIRECRAWL_API_KEY` for web search.

### 2. Create new edge function: `research-and-improve/index.ts`
This function does the heavy lifting:

**Input**: `{ project_id, evaluation, spec }` (called from evaluate-call after scoring)

**Steps**:
- Takes the `humanness_suggestions`, `issues_detected`, and `use_case` from the evaluation
- Generates 2-3 targeted search queries (e.g., "best phone sales conversation techniques for travel agencies", "how to handle objections naturally on cold calls")
- Calls Firecrawl search API to find relevant articles/guides
- Sends the search results + the specific gaps to AI (Lovable AI) with a prompt like: "Distill these articles into 3-5 specific, actionable conversation techniques this agent should use. Be concrete -- give example phrases, not abstract advice."
- Returns the distilled techniques as an array of strings

**Output**: `{ research_notes: string[], sources: string[] }`

### 3. Update `evaluate-call/index.ts` to trigger research
After the existing humanness auto-apply logic, add a call to `research-and-improve` when:
- `humanness_score < 80`, OR
- There are 2+ issues detected, OR  
- The evaluator flagged specific knowledge gaps

The research results get merged into `humanization_notes` alongside the evaluator's own suggestions (same dedup + cap-at-20 logic).

### 4. Add `research_sources` JSONB column to `agent_specs`
Track which URLs/articles the system used to generate improvements, so users can see where the knowledge came from. Default `[]`.

### 5. Update the UI (`TestResultsModal.tsx`)
Add a "Research Sources" section below the learned techniques that shows links to articles/resources the system found and used to improve the agent.

## Files to Create/Modify

- **Firecrawl connector**: Link to project (connect tool)
- **Database migration**: Add `research_sources JSONB DEFAULT '[]'` to `agent_specs`
- **`supabase/functions/research-and-improve/index.ts`**: New edge function -- web search + AI distillation
- **`supabase/config.toml`**: Add `research-and-improve` function config
- **`supabase/functions/evaluate-call/index.ts`**: Call research-and-improve after evaluation when gaps are found
- **`src/components/TestResultsModal.tsx`**: Show research sources in results

## The Enhanced Self-Improvement Loop

```
Call completes
  --> Evaluate: humanness_score = 55, suggestions = ["handle objections better", "more small talk"]
  --> Score < 80, trigger research
  --> Search: "best objection handling phone sales travel" 
  --> Found 3 articles with techniques
  --> AI distills: ["When prospect says 'I need to think about it', respond with 'Totally fair -- what part are you weighing?'", ...]
  --> Merge into humanization_notes + save sources
  --> Next call uses both evaluator feedback AND researched best practices
```

