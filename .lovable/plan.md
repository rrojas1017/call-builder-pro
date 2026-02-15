

## Add Agent Profile Summary to Campaign Builder

### What it does

When you select an agent in the "New Campaign" form, a summary card appears below the dropdown showing the agent's "resume" -- its voice, experience stats, maturity level, knowledge base size, and key configuration details. This gives you confidence you're picking the right agent.

### What the card will show

| Field | Source |
|---|---|
| Description | `agent_projects.description` |
| Maturity Level | `agent_projects.maturity_level` (Training/Developing/Competent/Expert/Graduated) |
| Voice | `agent_specs.voice_id` (or "Maya (default)") |
| Mode | `agent_specs.mode` (Outbound/Inbound/Hybrid) |
| Total Calls Made | Count from `calls` table for this agent |
| Qualified Calls | Count of calls with `outcome = 'qualified'` |
| Avg Call Score | Average of `evaluation->>'overall_score'` from calls |
| Knowledge Entries | Count from `agent_knowledge` table |
| Spec Version | `agent_specs.version` (how many times the agent has been refined) |
| Improvements Applied | Count from `improvements` table |

### Technical details

**File: `src/pages/CampaignsPage.tsx`**

1. Expand the `Agent` interface to include `description` and `maturity_level` (fetched from the existing agents query)
2. Update the agents query to: `select("id, name, description, maturity_level")`
3. Add a `useEffect` that triggers when `selectedAgent` changes -- fetches the agent's specs, call stats, knowledge count, and improvements count in parallel
4. Render a styled summary card below the Agent dropdown when an agent is selected, showing all the profile data in a compact grid layout
5. Use the existing `maturityConfig` badge styling from `AgentsPage.tsx` for the maturity level display

### Layout

The card appears directly below the Agent select dropdown with a subtle border and background, containing two rows:
- **Row 1**: Description text, maturity badge, voice name, mode
- **Row 2**: Stats grid -- Total Calls, Qualified, Avg Score, Knowledge Entries, Version, Improvements

