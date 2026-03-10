

# Clone Agent Feature

## What It Does
Adds a "Clone" action button to each agent card/row. Clicking it duplicates the agent project, its spec, and its knowledge entries — creating a new agent named "[Original Name] (Copy)" that the user can then modify independently.

## Changes

### `src/pages/AgentsPage.tsx`
- Add a `Copy` icon import from lucide-react
- Add `cloneAgent` async function that:
  1. Fetches the source agent's `agent_specs` row
  2. Inserts a new `agent_projects` row with name `"{name} (Copy)"` and same org_id/description
  3. Inserts a new `agent_specs` row copying all fields from the original spec (excluding `id`, `retell_agent_id`, and setting `version: 1`)
  4. Copies `agent_knowledge` entries for the new project
  5. Shows a toast and reloads the agent list
- Add `cloningId` loading state to show a spinner on the cloned agent's button
- Add "Clone" action in `AgentActions` component (between Knowledge and Delete)

### No backend function needed
All data is accessible via existing RLS policies — the clone is a client-side read + insert operation using the existing Supabase client.

### Files Changed
| File | Change |
|------|--------|
| `src/pages/AgentsPage.tsx` | Add clone button and duplication logic |

