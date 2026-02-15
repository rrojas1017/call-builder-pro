

## Auto-Graduation System for AI Agents

### Concept

Agents progress through maturity stages based on consistent performance. When an agent hits defined score thresholds over a minimum number of calls, it automatically "graduates" to the next level. This gives you clear visibility into which agents are production-ready vs. still training.

### Maturity Levels

| Level | Label | Criteria |
|---|---|---|
| Training | "Training" | Default state, fewer than 5 evaluated calls |
| Developing | "Developing" | 5+ calls, average overall score 50-69 |
| Competent | "Competent" | 10+ calls, average overall score 70-84 over last 10 calls |
| Expert | "Expert" | 20+ calls, average overall score 85+ over last 10 calls, no score below 70 in last 5 |
| Graduated | "Graduated" | 30+ calls, average overall score 90+ over last 15 calls, stable (no version with score drop > 5 pts) |

### Implementation

#### 1. New `maturity_level` Column on `agent_projects`

Add a column to track the current graduation level per agent:

```sql
ALTER TABLE agent_projects 
ADD COLUMN maturity_level TEXT NOT NULL DEFAULT 'training';
```

#### 2. Graduation Check Function (Backend)

After each call evaluation in `evaluate-call/index.ts`, run a lightweight graduation check:

- Query `score_snapshots` for the agent's recent history
- Count total evaluated calls from the `calls` table
- Compute the rolling average and check against thresholds
- If the agent qualifies for a higher (or lower) level, update `agent_projects.maturity_level`

This is a ~30-line addition at the end of the existing evaluate-call function -- no new edge function needed.

#### 3. Maturity Badge on Agents Page

Show the current level as a color-coded badge on each agent card in `AgentsPage.tsx`:

- Training: gray
- Developing: blue
- Competent: yellow/amber
- Expert: green
- Graduated: purple with a graduation cap icon

#### 4. Progress Indicator on Knowledge Page

Enhance the existing `LearningProgressBar` in `AgentKnowledgePage.tsx` to show:

- Current maturity level with badge
- Progress toward next level (e.g., "7/10 calls needed, avg 72/85 required")
- A simple progress bar showing how close the agent is to graduating

#### 5. Demotion Logic

If an agent's rolling average drops below its current level threshold (e.g., Expert drops below 85 avg over last 10), it gets demoted back one level. This prevents premature graduation from being permanent.

---

### Technical Summary

| File | Change |
|---|---|
| Database migration | Add `maturity_level` column to `agent_projects` |
| `supabase/functions/evaluate-call/index.ts` | Add graduation check after evaluation completes |
| `src/pages/AgentsPage.tsx` | Show maturity badge on agent cards |
| `src/pages/AgentKnowledgePage.tsx` | Add graduation progress section to LearningProgressBar |

### What This Achieves

- Agents automatically progress from "Training" to "Graduated" as they prove consistency
- You can see at a glance which agents are ready for production campaigns
- Agents that regress get demoted, preventing false confidence
- No manual rating needed -- the system tracks it automatically based on real call performance
