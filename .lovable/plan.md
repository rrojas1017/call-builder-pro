

## Problem

The current learning loop is **failure-driven only**: it triggers research when humanness scores drop below 80 or knowledge gaps are detected. It never analyzes **successful calls** to extract winning patterns. In production with hundreds of calls, the most valuable learning signal is: "What did the agent do differently on calls that converted vs. calls that didn't?"

## Solution: Success-Based Learning Loop

Add a "learn from winners" step to the `evaluate-call` function that, after every Nth successful call (e.g., every 5 qualified outcomes), triggers a new edge function `learn-from-success` that:

1. Pulls the transcripts of recent successful calls (qualified/converted)
2. Compares them against recent unsuccessful calls
3. Uses AI to extract **winning patterns** (phrases, techniques, pacing)
4. Saves those patterns back to `agent_knowledge` with a new category: `"winning_pattern"`
5. These patterns then flow into the pre-call summarization briefing automatically

### Architecture

```text
Bland Webhook
   |
   v
evaluate-call (already runs on ALL calls)
   |
   +-- Low score? --> research-and-improve (existing)
   |
   +-- Successful outcome? --> Check: is this the 5th success?
         |
         YES --> learn-from-success (NEW)
                   |
                   +-- Fetch 5 recent successful transcripts
                   +-- Fetch 5 recent unsuccessful transcripts
                   +-- AI: "What patterns distinguish winners?"
                   +-- Save winning_patterns to agent_knowledge
                   +-- Patterns auto-included in next briefing
```

### Files to Create/Modify

**1. Create: `supabase/functions/learn-from-success/index.ts`**
- Accept: `project_id`
- Fetch last 5 calls with `outcome = 'qualified'` and last 5 with `outcome IN ('completed', 'disqualified')`
- Send both sets of transcripts to Lovable AI (Gemini Flash)
- System prompt: "Compare these successful vs unsuccessful call transcripts. Extract 3-5 specific techniques, phrases, or approaches that the successful calls used but the unsuccessful ones didn't."
- Save results to `agent_knowledge` with `category = 'winning_pattern'` and `source_type = 'success_analysis'`
- Deduplicate against existing entries

**2. Modify: `supabase/functions/evaluate-call/index.ts`**
- After storing the evaluation, check if this call's outcome is "qualified"
- If yes, count recent qualified calls for this project
- Every 5th qualified call, trigger `learn-from-success`
- This avoids running the analysis on every single call (cost/performance)

**3. Update: `supabase/config.toml`**
- Register `[functions.learn-from-success]` with `verify_jwt = false`

### What the AI Analyzes

The comparison prompt will ask:
- What opening approaches led to engagement vs. hang-ups?
- How did the agent handle objections differently in successful calls?
- What pacing or tone patterns correlate with success?
- Were there specific phrases or transitions that kept the caller engaged?
- How did data collection flow differ (order, timing, framing)?

### Output Example

```json
{
  "winning_patterns": [
    "Successful calls asked about the caller's current situation before mentioning benefits, creating a consultative tone",
    "Top calls used the phrase 'just to make sure you get the best option' before income questions, reducing resistance",
    "Converted calls spent 20+ seconds on rapport before any qualification questions"
  ]
}
```

These get saved to `agent_knowledge` as `winning_pattern` entries and automatically flow into the pre-call briefing via the existing `summarize-agent-knowledge` function.

### Trigger Frequency

| Scenario | Trigger? |
|----------|----------|
| Every completed call | No (too expensive) |
| Every qualified call | No (still frequent) |
| Every 5th qualified call per project | Yes (balanced) |
| Manual trigger from dashboard | Future enhancement |

### Edge Cases

| Case | Handling |
|------|----------|
| Fewer than 5 successful calls | Skip analysis, wait for more data |
| Fewer than 3 unsuccessful calls | Use only successful calls, extract general patterns |
| All calls successful | Skip comparison, no contrast to learn from |
| AI returns duplicate patterns | Deduplicate against existing `agent_knowledge` entries |

### Impact

- Agents don't just avoid mistakes -- they **replicate what works**
- Learning is driven by real production outcomes, not synthetic test scenarios
- The summarization briefing automatically picks up winning patterns
- Over time, conversion rates should trend upward as the agent internalizes successful approaches

