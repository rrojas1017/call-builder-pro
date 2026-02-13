

## Add Delete Agent with Confirmation Dialog

### Overview
Add a "Delete" button to each agent card on the Agents page. Clicking it opens a confirmation dialog warning about permanent data loss. On confirmation, the agent and all related data are deleted.

### Database Consideration
Most foreign keys already have `ON DELETE CASCADE`, so deleting from `agent_projects` automatically removes specs, knowledge, campaigns (via `project_id`), calls, test runs, improvements, and wizard questions. Two foreign keys need attention:

- `inbound_numbers.project_id` -- no CASCADE (nullable column, will be set to NULL before delete)
- `campaigns.agent_project_id` -- no CASCADE (nullable column, will be set to NULL before delete)

No database migration is needed since we can handle this in application code by nullifying those references before deleting.

### Changes

**File: `src/pages/AgentsPage.tsx`**

1. Add imports for `Trash2` icon, `AlertDialog` components, and `useToast`
2. Add state for the agent being deleted (`deletingId`) and a loading flag
3. Add a delete handler that:
   - Sets `inbound_numbers.project_id = NULL` where it matches the agent ID
   - Sets `campaigns.agent_project_id = NULL` where it matches the agent ID
   - Deletes the row from `agent_projects` (CASCADE handles the rest)
   - Removes the agent from local state
   - Shows a success toast
4. Add a `Trash2` icon button in each agent card's action row (alongside Edit, Test, Knowledge)
5. Wrap the page in an `AlertDialog` that shows when `deletingId` is set, with:
   - Title: "Delete Agent?"
   - Description: "This will permanently delete this agent and all its data including campaigns, calls, test results, and knowledge. This action cannot be undone."
   - Cancel and Delete buttons (Delete styled as destructive)

### User Experience
- Delete button appears as a red-tinted trash icon in the action row of each agent card
- Clicking it opens a confirmation dialog -- no accidental deletions
- After deletion, the agent card disappears and a success toast confirms the action

