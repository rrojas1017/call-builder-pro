

## Enhance Voice Recommendations: Cross-Agent Catalog Suggestions

### The Problem

The current voice recommendation logic (lines 293-344 of `evaluate-call/index.ts`) only queries `score_snapshots` filtered by `project_id`:

```
.eq("project_id", call.project_id)
```

This means it can only recommend voices that **this specific agent** has already tried. A brand new agent or one that has only ever used one voice will never get a recommendation, even if the platform has extensive data showing that certain voices consistently score higher across other agents.

### The Fix

Expand the recommendation to two tiers:

1. **Tier 1 (same agent)**: Keep the existing logic -- compare voices this agent has tried (unchanged).
2. **Tier 2 (cross-agent catalog)**: If no same-agent recommendation is found, query `score_snapshots` across ALL projects, filtered by matching `language` (so a Spanish agent doesn't get recommended an English-optimized voice). Aggregate by `voice_id` globally to find top-performing voices platform-wide.

### Changes

#### 1. `supabase/functions/evaluate-call/index.ts` -- Voice recommendation section (lines 293-344)

Replace the current voice recommendation block with expanded logic:

- **Same-agent check (Tier 1)**: Keep existing logic that compares voices within `call.project_id`. No changes here.
- **Cross-agent fallback (Tier 2)**: When Tier 1 produces no recommendation (either because only one voice was tried, or no alternative beat the threshold):
  - Query `score_snapshots` across all projects (no `project_id` filter), with `call_count >= 5` (higher bar for cross-agent confidence)
  - Join or cross-reference `agent_specs` to filter by matching language (e.g., only suggest voices used by agents with the same `language` field)
  - Exclude the current voice from candidates
  - Find the voice with the highest weighted `avg_humanness` across all agents
  - Apply a higher threshold: must beat current voice by 8+ points (vs 5 for same-agent) to account for use-case variance
  - Tag the recommendation with `source: "cross_agent"` so the UI can distinguish it from same-agent recommendations

- **Recommendation output shape** (enhanced):

```json
{
  "current_voice": "maya",
  "current_avg_humanness": 72,
  "suggested_voice": "josh",
  "suggested_avg_humanness": 85,
  "source": "cross_agent",
  "confidence": "medium",
  "sample_size": 47,
  "reason": "Voice 'josh' averaged 85 humanness across 47 calls on 3 agents vs your current voice 'maya' at 72. Consider A/B testing."
}
```

- `source`: `"same_agent"` or `"cross_agent"` -- lets the UI show appropriate context
- `confidence`: `"high"` (same agent, 10+ calls) / `"medium"` (cross-agent, 5+ calls) / `"low"` (fewer calls)
- `sample_size`: total calls behind the suggestion

#### 2. Frontend display (no file changes needed)

The existing UI already renders `voice_recommendation` as a card. The new `source` and `confidence` fields can be used later to add a "Based on platform-wide data" label or a confidence indicator -- but no frontend changes are required for this to work. The `reason` string already explains the context.

### What This Solves

- **New agents get voice suggestions immediately** based on platform-wide performance data
- **Single-voice agents** (never A/B tested) can still receive data-driven recommendations
- **Cross-pollination**: A voice that consistently scores 90+ humanness across 5 different agents becomes a platform-wide recommendation
- **Language safety**: A Spanish agent won't be recommended an English-only voice

### What Stays the Same

- Same-agent Tier 1 logic is unchanged (existing behavior preserved)
- The 5-point threshold for same-agent recommendations stays
- Score snapshot tracking logic is untouched
- No database schema changes needed
