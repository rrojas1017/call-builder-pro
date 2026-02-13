

## Delete User: jfine@coverallhc.com

### What will be deleted

- **Auth user** (jfine@coverallhc.com) -- removed via admin API
- **Profile** -- cascades automatically (foreign key to auth.users)
- **User role** -- cascades automatically (foreign key to auth.users)
- **Organization** ("'s Org") -- only 1 member, will be orphaned, so we clean it up
- **2 agent projects** -- belong to the org
- **8 test runs** -- belong to the org
- **Any org_invitations, dial_lists, credit_transactions** for this org

### Implementation

**New edge function: `supabase/functions/delete-user/index.ts`**

A super-admin-only edge function that:
1. Verifies the caller is a super_admin (same pattern as `create-user`)
2. Accepts `{ user_id }` in the request body
3. Looks up the user's org and checks if they're the sole member
4. If sole member: deletes all org-related data (agent_projects, test_runs, dial_lists, calls, credit_transactions, org_invitations, sms_conversations, inbound_numbers) then deletes the organization
5. Deletes the auth user via `adminClient.auth.admin.deleteUser(user_id)` (which cascades to profiles and user_roles)
6. Returns success confirmation

### Execution

After creating the edge function, I will invoke it directly to delete this specific user (`8bc7242b-aee0-41e7-9001-966894cf9071`).

### Safety

- The function requires super_admin authorization
- Only deletes the specified user -- no batch operations
- Cleans up orphaned org data to prevent dangling references
