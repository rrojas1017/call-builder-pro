

## Smarter Feedback Loop: Score Regression Tracking and Voice Recommendations

### The Problem

Looking at the data, one agent has **36 improvements applied** in 2 days with the same fields being patched repeatedly (e.g., `must_collect_fields` updated at versions 33, 35, 36, 37). The system keeps suggesting changes without knowing what was already tried or whether previous fixes helped. There is also no mechanism to recommend voice changes based on performance data.

Three root causes:

1. **No "before vs after" tracking** -- The evaluation AI doesn't know what was recently changed, so it suggests the same type of fix repeatedly without checking if the last one worked.
2. **No regression detection** -- If a fix makes scores worse, nothing flags it. The system keeps piling on changes.
3. **No voice-performance correlation** -- Voice selection is entirely manual with no data on which voices produce better outcomes.

---

### Changes Overview

#### 1. Improvement History Context in Evaluations (Backend)

**File: `supabase/functions/evaluate-call/index.ts`**

Before calling the AI evaluator, fetch the last 5 improvements applied to this agent and the last 3 evaluation scores. Include them in the system prompt so the AI knows:
- What was recently changed (and when)
- Whether scores went up or down after each change
- What NOT to suggest again if the last attempt didn't help

This prevents circular suggestions like "change the opening line" being recommended repeatedly even though it was already changed twice.

New section added to the system prompt:
```
RECENT CHANGE HISTORY (do NOT re-suggest changes that were already applied 
and didn't improve scores):
- v31: interruption_threshold changed to 800 (scores before: 45, after: 42 -- NO IMPROVEMENT)
- v32: temperature changed to 0.8 (scores before: 42, after: 50 -- IMPROVED)
...
If a previous fix didn't improve scores, suggest a DIFFERENT approach to the same problem.
```

#### 2. Score Trend Tracking Table (Database)

**New migration: Create `score_snapshots` table**

```sql
CREATE TABLE public.score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES agent_projects(id),
  spec_version INTEGER NOT NULL,
  voice_id TEXT,
  avg_humanness NUMERIC,
  avg_naturalness NUMERIC,
  avg_overall NUMERIC,
  call_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

After each evaluation, update the snapshot for the current spec version + voice combination. This gives a clear picture: "Version 31 with voice 'maya' averaged 45 humanness over 3 calls; version 32 with 'maya' averaged 50 over 2 calls."

#### 3. Voice Performance Analytics and Recommendations (Backend)

**File: `supabase/functions/evaluate-call/index.ts`** (addition at end)

After storing the evaluation, update the `score_snapshots` table. When enough data accumulates (5+ calls on current voice), compare the current voice's average scores against any other voices that were previously used on this agent. If another voice historically performed better, add a voice recommendation to the evaluation output.

**New field in evaluation output**: `voice_recommendation`
```json
{
  "voice_recommendation": {
    "current_voice": "matt",
    "current_avg_humanness": 52,
    "suggested_voice": "maya", 
    "suggested_avg_humanness": 71,
    "reason": "Voice 'maya' averaged 71 humanness over 8 calls vs current voice 'matt' at 52 over 5 calls"
  }
}
```

#### 4. Regression Alert in Evaluation UI (Frontend)

**Files: `src/pages/GymPage.tsx`, `src/components/TestResultsModal.tsx`, `src/pages/CallsPage.tsx`**

When displaying evaluation results, if the current scores are lower than the previous evaluation for the same agent:
- Show a warning badge: "Scores dropped since last change (v31 to v32)"  
- Show which specific fix may have caused the regression
- Offer a "Revert" option that undoes the last patch

#### 5. Voice Suggestion Card in Evaluation Results (Frontend)

**Files: `src/pages/GymPage.tsx`, `src/components/TestResultsModal.tsx`**

When `evaluation.voice_recommendation` is present, render a card:
- Shows current voice performance vs recommended voice
- "Switch Voice" button that updates the agent spec's `voice_id`
- Only appears when there's meaningful data (5+ calls per voice)

#### 6. Smarter Deduplication in Apply-Improvement (Backend)

**File: `supabase/functions/apply-improvement/index.ts`**

Before applying a fix, check if the exact same field was changed in the last 3 versions. If so, and scores didn't improve, log a warning and add a `caution` field to the response so the UI can warn the user: "This field was already changed recently without improvement. Consider a different approach."

---

### Technical Summary

| Component | File | Change |
|---|---|---|
| Score snapshots table | Migration | New table to track per-version, per-voice averages |
| Improvement history in eval prompt | `evaluate-call/index.ts` | Fetch last 5 improvements + scores, inject into AI context |
| Voice performance comparison | `evaluate-call/index.ts` | Compare voice averages, emit `voice_recommendation` |
| Snapshot updates | `evaluate-call/index.ts` | Upsert `score_snapshots` after each eval |
| Regression warnings | `GymPage.tsx`, `TestResultsModal.tsx`, `CallsPage.tsx` | Show score delta badges and revert option |
| Voice suggestion card | `GymPage.tsx`, `TestResultsModal.tsx` | Render voice recommendation with switch button |
| Duplicate fix caution | `apply-improvement/index.ts` | Warn when re-patching same field without improvement |

### What stays the same
- The `research-and-improve` and `learn-from-success` loops (they continue enriching knowledge)
- The existing evaluation scoring rubric (humanness, naturalness, compliance, objective)
- Voice selection UI in agent editing (this adds data-driven suggestions, not a replacement)
- All existing improvement application logic

