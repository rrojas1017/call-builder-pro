

## AI Training Pipeline Audit — Claude + GPT-5.2 Dual-Model Review

### What This Does

Build a new "audit-training-pipeline" backend function that uses **Claude Sonnet 4** and **GPT-5.2** as two independent reviewers to analyze your entire AI agent training and feedback loop. Each model receives all your Bland AI configuration data, prompt engineering logic, evaluation rubrics, and improvement history — then independently assesses whether the current approach is the most efficient and functional option. Their findings are merged into a unified audit report accessible from a new page in the UI.

### Why Two Models

Using two different AI architectures (Claude for deep reasoning, GPT-5.2 for broad pattern recognition) creates a "second opinion" effect. If both models flag the same issue, it's almost certainly real. If only one flags it, it's worth investigating but may be a false positive.

### Architecture

The system works in three stages:

1. **Data Collection** — The edge function gathers all relevant data from the database for a given agent
2. **Dual Review** — Claude and GPT-5.2 each independently analyze the full pipeline and return structured findings
3. **Merge + Display** — Results are combined, areas of agreement highlighted, and displayed in a new UI page

### Data Collected for Review

For each agent, the function will pull and provide to both models:

| Data Source | What It Contains |
|-------------|-----------------|
| `agent_specs` | Full spec: prompt config, tone, voice settings, temperature, interruption threshold, speaking speed, transfer rules, qualification logic |
| `agent_knowledge` | All knowledge entries across categories (product, objection handling, winning patterns, conversation techniques) |
| `buildTaskPrompt` output | The actual compiled prompt being sent to Bland AI |
| `calls` (last 20) | Recent transcripts, outcomes, durations, scores |
| `evaluations` (last 20) | Evaluation rubrics: humanness, naturalness, compliance, issues detected, knowledge gaps |
| `improvements` (last 10) | Change history: what was changed, from/to versions, whether scores improved |
| `score_snapshots` | Score trends across versions and voices |
| `global_human_behaviors` | Cross-agent conversation techniques being applied |
| Bland API config | Model (`base`), temperature, interruption_threshold, noise_cancellation, voice_settings, pronunciation_guide, voicemail config |

### What Each Model Reviews

Both Claude and GPT-5.2 receive identical data and are asked to evaluate:

1. **Prompt Engineering Efficiency** — Is the task prompt structure optimal? Is it too long/short? Are there conflicting instructions? Is knowledge being injected effectively?
2. **Evaluation Loop Quality** — Is the scoring rubric catching the right issues? Are improvements actually improving scores? Is the anti-repetition directive working?
3. **Bland AI Configuration** — Are the voice settings (temperature, interruption threshold, speaking speed) optimal for the use case? Is the model choice (`base`) the best option?
4. **Knowledge Pipeline** — Is auto-research producing useful knowledge? Is knowledge summarization losing critical details at 500 chars? Are winning patterns being extracted effectively?
5. **Training Feedback Loop** — Is the evaluate -> improve -> re-test cycle actually converging on better performance? Are there bottlenecks or circular improvements?
6. **Missed Opportunities** — What Bland AI features aren't being used that could help? What prompt techniques could improve humanness scores?

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/audit-training-pipeline/index.ts` | **New** — Edge function that collects all agent data, sends to Claude + GPT-5.2 in parallel, merges structured results |
| `src/pages/TrainingAuditPage.tsx` | **New** — UI page showing the dual-model audit report with agreement/disagreement highlighting |
| `src/App.tsx` | Add route for `/training-audit` |
| `src/hooks/useSidebarConfig.ts` | Add navigation link under an appropriate section |

### Technical Details

**Edge Function: `audit-training-pipeline`**

- Accepts `{ project_id }` 
- Queries all tables listed above using service role
- Compiles the actual `buildTaskPrompt` output for the agent
- Sends identical payloads to Claude (via `callAI` with `provider: "claude"`) and GPT-5.2 (via Lovable AI Gateway with `model: "openai/gpt-5.2"`) in parallel using `Promise.all`
- Both use tool calling to return structured JSON with categories: `prompt_engineering`, `evaluation_loop`, `bland_config`, `knowledge_pipeline`, `feedback_loop`, `missed_opportunities`
- Each category has: `rating` (1-10), `findings` (array of issues), `recommendations` (array of actionable fixes)
- Results are saved to a new `training_audits` table for history

**UI Page**

- Trigger button per agent: "Run Pipeline Audit"
- Shows results side-by-side: Claude's findings vs GPT-5.2's findings
- Highlights areas where both models agree (high confidence)
- Shows overall pipeline health score (average of both models' ratings)
- Each recommendation has an "Apply" action where applicable (e.g., change temperature, update prompt structure)

**Database Migration**

```sql
CREATE TABLE public.training_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  claude_results JSONB,
  gpt_results JSONB,
  merged_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.training_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org audits"
  ON public.training_audits FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ));
```

### What You'll See

After running an audit on an agent, you'll get a report like:

- **Prompt Engineering** — Claude: 7/10, GPT-5.2: 8/10 — Both agree the prompt is too long at ~28K chars and knowledge briefing compression to 500 chars loses critical objection-handling details
- **Bland Config** — Claude: 6/10, GPT-5.2: 7/10 — Both suggest testing `enhanced` model instead of `base` for complex qualification logic; Claude flags temperature 0.7 as too high for compliance-sensitive calls
- **Feedback Loop** — Claude: 8/10, GPT-5.2: 6/10 — Disagreement: Claude thinks the anti-repetition directive is working well, GPT-5.2 flags that improvements are oscillating on the same fields

This gives you a data-driven view of whether your training pipeline is actually working or just spinning its wheels.

