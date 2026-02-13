

## User Audit Log -- Admin-Only Section

### Overview
A new "Audit Log" page under the ADMIN section in the sidebar, accessible only to super admins. It will track all user activities across the platform with filtering and search capabilities.

### Database

**New table: `audit_logs`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| org_id | uuid | Organization context |
| user_id | uuid | Who performed the action |
| user_email | text | Denormalized for easy display |
| action | text | e.g. `login`, `agent.created`, `campaign.started` |
| entity_type | text | e.g. `agent`, `campaign`, `user`, `settings` |
| entity_id | text | ID of the affected record (nullable) |
| details | jsonb | Extra context (old/new values, metadata) |
| ip_address | text | Optional, from edge functions |
| created_at | timestamptz | When it happened |

**RLS policies:**
- Super admins can SELECT all rows
- No direct INSERT/UPDATE/DELETE from client -- inserts happen via a database function called from edge functions and triggers

**Database function: `log_audit_event`**
- A `SECURITY DEFINER` function that inserts into `audit_logs`
- Called from edge functions and can be called from triggers

### Tracked Activities

Events will be logged by adding `log_audit_event` calls to existing edge functions and adding database triggers:

| Category | Events |
|----------|--------|
| **Auth** | `user.login`, `user.login_failed`, `user.created`, `user.deleted` |
| **Agents** | `agent.created`, `agent.updated`, `agent.deleted`, `agent.spec_updated` |
| **Campaigns** | `campaign.created`, `campaign.started`, `campaign.paused` |
| **Test Runs** | `test_run.created`, `test_run.started` |
| **Lists** | `list.uploaded`, `list.deleted` |
| **Knowledge** | `knowledge.added`, `knowledge.deleted` |
| **Team** | `user.role_changed`, `user.removed`, `invitation.sent` |
| **Settings** | `settings.updated`, `org.name_changed` |
| **Billing** | `credits.topped_up` |
| **Inbound** | `number.purchased`, `number.released` |

### Frontend

**New page: `src/pages/AuditLogPage.tsx`**

- Table view with columns: Timestamp, User, Action, Entity, Details
- Filters: date range, user, action category, entity type
- Search by user email or entity ID
- Paginated (50 rows per page)
- Color-coded action badges (auth = blue, destructive actions = red, etc.)
- Expandable detail rows to show full JSON details

**Sidebar update: `src/components/AppSidebar.tsx`**

- Add "Audit Log" item under the ADMIN section with a `ScrollText` icon

**Route: `src/App.tsx`**

- Add `/admin/audit` route pointing to `AuditLogPage`

### Implementation Order

1. Create `audit_logs` table + RLS + `log_audit_event` function (migration)
2. Add database triggers for table-level events (INSERT/UPDATE/DELETE on key tables)
3. Update edge functions (`create-user`, `delete-user`, `start-campaign`, `run-test-run`, etc.) to call `log_audit_event`
4. Build `AuditLogPage.tsx` with filters, pagination, and detail expansion
5. Add sidebar link and route

### Technical Notes

- The `log_audit_event` function will accept parameters and insert with `SECURITY DEFINER` so it works regardless of RLS
- For edge functions, the audit call uses the service role client
- Database triggers on `agent_projects`, `campaigns`, `dial_lists`, `agent_specs`, `org_invitations`, and `inbound_numbers` will automatically log INSERT/UPDATE/DELETE events
- Auth events (login/logout) will be logged by adding calls in the `create-user` and `delete-user` edge functions; login tracking requires a lightweight auth webhook or can be pulled from the existing auth logs view

