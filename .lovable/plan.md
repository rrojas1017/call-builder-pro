
# Per-Agent Knowledge Base with Smart Auto-Research

## What This Does
Right now, research results and humanization notes are stored as flat arrays on `agent_specs` -- invisible to users and not editable. The knowledge base page (`/knowledge`) is a generic file uploader tied to the user, not to any specific agent.

This upgrade creates a **per-agent knowledge system** where:
- Each agent has its own knowledge profile that the system populates automatically
- The system recognizes knowledge gaps based on the agent's **use case / vertical** and proactively researches product knowledge, industry terminology, objection patterns, and competitor info
- All auto-researched knowledge is visible to the creator, who can edit or delete individual entries
- The research function becomes smarter -- it doesn't just search for "conversation techniques" but also for **domain-specific product knowledge** relevant to that agent's vertical

## Changes

### 1. New DB table: `agent_knowledge`
A dedicated table to store structured knowledge entries per agent, each editable/deletable by the creator.

```
agent_knowledge
- id (uuid, PK)
- project_id (uuid, FK to agent_projects)
- category (text): "conversation_technique" | "product_knowledge" | "objection_handling" | "industry_insight" | "competitor_info"
- content (text): the actual knowledge entry
- source_url (text, nullable): where it came from
- source_type (text): "auto_research" | "evaluation" | "manual"
- created_at (timestamptz)
```

RLS: org members can view, admins can manage (matching existing patterns).

### 2. Update `research-and-improve` to search for domain knowledge
Currently it only searches for "conversation techniques." Upgrade it to also generate queries for:
- Product/industry knowledge based on `use_case` (e.g., "ACA health insurance qualification requirements 2026", "solar panel installation common customer questions")
- Objection handling specific to the vertical (e.g., "common objections in health insurance sales")
- Competitor awareness (e.g., "top ACA marketplace providers comparison")

Each distilled item gets categorized and saved to `agent_knowledge` instead of (or in addition to) the flat `humanization_notes` array. The `humanization_notes` array continues to be injected into the prompt, but now it pulls from the full `agent_knowledge` table for that agent.

### 3. Update `evaluate-call` to detect knowledge gaps
Add a new evaluation output: `knowledge_gaps` -- an array of specific topics the agent lacked knowledge about during the call (e.g., "Agent couldn't answer question about subsidy eligibility", "Agent didn't know competitor pricing"). When gaps are detected, the research function targets those specific topics.

### 4. New UI: Agent Knowledge page
Replace the generic `/knowledge` page with a per-agent knowledge view accessible from the agents list. Shows:
- All knowledge entries grouped by category (tabs: All, Conversation, Product, Objections, Industry)
- Each entry shows content, source link, and source type badge (auto/manual)
- Delete button on each entry
- Edit button to modify content inline
- "Add Knowledge" button for manual entries
- The agent's use case/vertical displayed at the top

### 5. Update the task prompt to include domain knowledge
Update `buildTaskPrompt()` in `run-test-run` to load knowledge from `agent_knowledge` and inject relevant product knowledge, objection handling scripts, and industry insights into the prompt alongside the existing humanization notes.

## Technical Details

### Database Migration
```sql
CREATE TABLE agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'conversation_technique',
  content TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'auto_research',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
-- RLS: org members view, admins manage (via agent_projects join)
```

### Files to Create
- `src/pages/AgentKnowledgePage.tsx` -- per-agent knowledge management UI with category tabs, inline edit, delete, and manual add

### Files to Modify
- **`supabase/functions/research-and-improve/index.ts`** -- Add domain-specific search queries (product knowledge, objections, industry), save results to `agent_knowledge` table with proper categories, continue merging conversation techniques into `humanization_notes`
- **`supabase/functions/evaluate-call/index.ts`** -- Add `knowledge_gaps` to the evaluation schema so the evaluator flags topics the agent didn't know about; pass these gaps to the research function
- **`supabase/functions/run-test-run/index.ts`** -- Load `agent_knowledge` entries for the project and inject them into the prompt by category (product knowledge section, objection handling section, etc.)
- **`src/App.tsx`** -- Add route `/agents/:id/knowledge` for the new page
- **`src/pages/AgentsPage.tsx`** -- Add a "Knowledge" link on each agent card alongside the existing "Test" link
- **`src/components/TestResultsModal.tsx`** -- Show detected knowledge gaps in evaluation results

### How the Smart Knowledge Loop Works

```
Agent created with use_case = "solar panel sales"
  |
  v
First call --> Evaluation detects:
  - humanness_score: 62
  - knowledge_gaps: ["couldn't explain net metering", "didn't know about federal tax credit"]
  |
  v
Research triggers with domain-aware queries:
  - "solar panel net metering explanation for customers"
  - "federal solar tax credit 2026 eligibility"
  - "natural conversation techniques for solar sales calls"
  |
  v
Results saved to agent_knowledge:
  - [product_knowledge] "Net metering lets homeowners sell excess solar energy back..."
  - [product_knowledge] "The federal solar ITC provides a 30% tax credit..."
  - [conversation_technique] "When discussing savings, relate to their current bill..."
  |
  v
Next call prompt includes all knowledge
  --> Agent can now answer net metering questions naturally
  --> Creator can see, edit, or delete any entry from the Knowledge page
```
