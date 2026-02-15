

## Unified Audit: Merge Both Models into One Set of Recommendations + Cross-Agent Learning

### Problem Today

1. **Redundant output** -- Claude and GPT-5.2 return separate findings/recommendations per category, often saying the same thing in different words. The UI shows them side-by-side, forcing you to mentally de-duplicate.
2. **No cross-agent memory** -- When you audit Agent B, the system has no idea what fixes were already applied to Agent A (even within the same org), missing patterns that transfer across agents.

### What Changes

**The edge function still runs both models in parallel**, but adds a third AI step: a "merge + prioritize" pass that takes both raw outputs and produces a single unified set of findings and recommendations per category. This merge step also receives cross-agent context (recent improvements applied to other agents in the same org) so it can flag transferable fixes and avoid recommending things already tried elsewhere.

**The UI switches from side-by-side columns to a single unified list** per category, with source attribution badges (e.g., "Both models", "Claude only", "GPT only") and a new "Cross-Agent Insight" tag for recommendations informed by other agents' history.

### Architecture

```text
Claude audit ──┐
               ├──> Merge AI call (Gemini Flash) ──> unified_results
GPT audit ─────┘         |
                          |
Cross-agent improvements ─┘
(other agents in same org, last 30 days)
```

### Changes

| File | What |
|------|------|
| `supabase/functions/audit-training-pipeline/index.ts` | 1. Fetch recent improvements from OTHER agents in the same org. 2. After both model calls, run a third AI call (Gemini Flash) that merges Claude + GPT results into a single unified structure with source attribution and cross-agent context. 3. Save `unified_results` alongside raw results. |
| Database migration | Add `unified_results jsonb` and `cross_agent_context jsonb` columns to `training_audits`. |
| `src/pages/TrainingAuditPage.tsx` | Replace the two-column Claude/GPT layout with a single unified view per category. Each finding/recommendation shows a source badge. Add a "Cross-Agent Insights" section when relevant. Fall back to old side-by-side if `unified_results` is null (for historical audits). |

### Edge Function: Merge Step Details

After getting `claudeAudit` and `gptAudit`, the function:

1. **Fetches cross-agent improvements**: Queries the `improvements` table for all OTHER projects in the same org from the last 30 days, including their `change_summary` and `patch` fields.

2. **Calls Gemini Flash** with a merge prompt:
   - Input: both raw audits + cross-agent improvement history
   - Tool schema returns per category:
     - `rating` (single consensus score)
     - `findings` (array of `{ text, source: "both" | "claude" | "gpt", priority: "critical" | "important" | "minor" }`)
     - `recommendations` (array of `{ text, source, priority, cross_agent_note?: string }`)
   - The merge prompt instructs the AI to: de-duplicate similar findings, take the more specific/actionable version, flag when models disagree, and annotate recommendations that overlap with fixes already applied to sibling agents.

3. **Saves** `unified_results` and `cross_agent_context` (summary of what sibling fixes were considered) to the audit row.

### UI: Unified View

Each category card will show:
- Single consensus rating (from merged results)
- One list of findings, each with a small badge showing source ("Both", "Claude", "GPT")
- One list of recommendations with priority badges (Critical/Important/Minor)
- Recommendations with `cross_agent_note` get a special "Insight from [Agent Name]" tag showing what was learned from sibling agents
- Historical audits without `unified_results` fall back to the existing side-by-side layout

### Merge Tool Schema

```json
{
  "name": "submit_merged_audit",
  "parameters": {
    "type": "object",
    "properties": {
      "prompt_engineering": {
        "rating": "number",
        "findings": [{ "text": "string", "source": "both|claude|gpt", "priority": "critical|important|minor" }],
        "recommendations": [{ "text": "string", "source": "both|claude|gpt", "priority": "...", "cross_agent_note": "string|null" }]
      }
      // ... same structure for all 6 categories
    }
  }
}
```

### Cross-Agent Query

```sql
SELECT i.change_summary, i.patch, i.created_at, p.name as agent_name
FROM improvements i
JOIN agent_projects p ON p.id = i.project_id
WHERE p.org_id = $org_id
  AND i.project_id != $current_project_id
  AND i.created_at > now() - interval '30 days'
ORDER BY i.created_at DESC
LIMIT 20
```

This gives the merge AI enough context to say things like: "Your insurance agent 'Sarah' already fixed this exact temperature issue -- consider applying the same 0.4 setting here."

