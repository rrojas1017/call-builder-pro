

## Centralize Human Behavior Learning Across All Agents

### What This Solves
Right now, conversation techniques and humanness learnings are stored per-agent in `humanization_notes` on `agent_specs`. If one agent learns "use the caller's name after they share personal info," that knowledge stays with only that agent. New agents start from zero.

This change creates a **global human behavior library** that every agent -- new and existing -- automatically benefits from, while keeping agent-specific knowledge (product details, objection handling) private to each agent.

### How It Works

```text
+---------------------------+       +---------------------------+
|   Global Human Behaviors  |       |  Per-Agent Knowledge      |
|   (shared across ALL)     |       |  (agent_knowledge table)  |
|                           |       |                           |
|  - Conversation techniques|       |  - Product knowledge      |
|  - Empathy patterns       |       |  - Objection handling     |
|  - Rapport-building tips  |       |  - Industry insights      |
|  - Small talk approaches  |       |  - Competitor info        |
+---------------------------+       +---------------------------+
          |                                    |
          +----------+   +--------------------+
                     |   |
               +-----v---v------+
               |  Agent Prompt  |
               |  (combined)    |
               +----------------+
```

### Technical Changes

**1. New Database Table: `global_human_behaviors`**
- `id` (uuid, primary key)
- `content` (text) -- the learned behavior
- `source_type` (text) -- "auto_learned" or "manual"
- `source_agent_id` (uuid, nullable) -- which agent discovered it
- `created_at` (timestamptz)

This table has NO `project_id` or `org_id` -- it is truly global across all agents.

**2. Update `evaluate-call` Edge Function**
- When humanness suggestions are generated, save them to BOTH:
  - The agent's own `humanization_notes` (existing behavior, unchanged)
  - The new `global_human_behaviors` table (so all agents benefit)
- Deduplicate against existing global entries before inserting

**3. Update `research-and-improve` Edge Function**
- When conversation techniques are discovered, also save them to `global_human_behaviors`
- Keep the existing per-agent save behavior unchanged

**4. Update `run-test-run/index.ts` (buildTaskPrompt)**
- Before building the prompt, query `global_human_behaviors` table
- Inject global behaviors into the "LEARNED CONVERSATION TECHNIQUES" section alongside the agent's own `humanization_notes`
- Merge and deduplicate so the same tip doesn't appear twice

**5. Update `tick-campaign/index.ts` (buildTaskPrompt)**
- This prompt currently has NO humanization_notes section at all
- Add a query for `global_human_behaviors` and inject them into the prompt
- This ensures campaign calls also benefit from all learned human behaviors

**6. Seed Initial Global Behaviors**
- Migrate the best existing hardcoded conversation instructions (currently in `run-test-run` lines 86-94) into the `global_human_behaviors` table as seed data
- These become the baseline that all agents start with

### Files to Modify
- **New migration**: Create `global_human_behaviors` table with RLS policy (service role access)
- **`supabase/functions/evaluate-call/index.ts`**: Add insert to `global_human_behaviors` when humanness suggestions are generated
- **`supabase/functions/research-and-improve/index.ts`**: Add insert to `global_human_behaviors` for conversation techniques
- **`supabase/functions/run-test-run/index.ts`**: Query and inject global behaviors into prompt
- **`supabase/functions/tick-campaign/index.ts`**: Query and inject global behaviors into prompt

### What Stays Per-Agent
- Product knowledge, objection handling, industry insights, competitor info (in `agent_knowledge`)
- Agent-specific evaluation history
- Agent spec settings (voice, tone, transfer number, etc.)

### What Becomes Global
- All conversation techniques and humanness suggestions
- Rapport-building tips
- Natural transition phrases
- Empathy and warmth patterns

