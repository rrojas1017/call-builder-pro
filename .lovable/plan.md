

## Super Admin User & Company Creation

### What this adds

Super admins will be able to create new users and companies directly from the Admin console, without the new user needing to sign up themselves. Two new capabilities:

1. **Create a new company** -- from the Companies page, a "New Company" button opens a dialog to enter a company name. This creates an empty organization ready to have users assigned.

2. **Create a user for a company** -- from the Company Detail page, an "Add User" button opens a dialog to enter email, full name, password, and role. The user is created server-side and immediately assigned to that company with the chosen role.

### How it works

```text
Super Admin clicks "Add User"
        |
        v
Frontend sends request to backend function
        |
        v
Backend function (service role):
  1. Creates auth user (email + password + full_name)
  2. Inserts profile with the target org_id
  3. Inserts user_role with the chosen role
  4. Returns success
        |
        v
Frontend refreshes the member list
```

### Part 1: Update the signup trigger

The existing `handle_new_user()` trigger always creates a new organization for every signup. It needs to be updated so that if a user is created with `org_id` in their metadata (as done by the super admin flow), the trigger assigns them to that existing org instead of creating a new one.

**Database migration:**
- Drop and recreate `handle_new_user()` to check for `raw_user_meta_data->>'org_id'`
- If present, use that org_id for the profile instead of creating a new organization
- If a role is provided in metadata (`raw_user_meta_data->>'role'`), use that instead of defaulting to `admin`

### Part 2: Backend function for user creation

**New file: `supabase/functions/create-user/index.ts`**

- Accepts: `{ email, password, full_name, org_id, role }`
- Validates the caller is a super_admin (checks JWT against `user_roles`)
- Uses Supabase Admin API (`auth.admin.createUser`) with `email_confirm: true` so no verification email is needed
- Passes `org_id` and `role` in user metadata so the trigger handles profile/role creation
- Returns the created user's id

### Part 3: Create Company from Admin Console

**New file: `supabase/functions/create-company/index.ts`**

- Accepts: `{ name }`
- Validates caller is super_admin
- Inserts into `organizations` table using service role
- Returns the new org id

**Why a backend function?** The `organizations` table has no INSERT RLS policy for any role (not even super_admin). Using a backend function with the service role key bypasses this cleanly without loosening RLS.

### Part 4: Frontend changes

**Modified: `src/pages/AdminCompaniesPage.tsx`**
- Add a "New Company" button next to the page title
- Opens a dialog with a company name input
- On submit, calls the `create-company` backend function
- Refreshes the list on success

**Modified: `src/pages/AdminCompanyDetailPage.tsx`**
- Add an "Add User" button in the Members section header
- Opens a dialog with fields: Email, Full Name, Password, Role (select)
- On submit, calls the `create-user` backend function with the current `orgId`
- Refreshes the member list on success

### Part 5: No RLS changes needed

- The backend functions use the service role key, so they bypass RLS entirely
- The existing super_admin SELECT policies already allow viewing all orgs, profiles, and roles
- No new client-side RLS policies are required

---

### Technical details

**Files to create:**
1. `supabase/functions/create-user/index.ts` -- backend function for user creation
2. `supabase/functions/create-company/index.ts` -- backend function for company creation

**Files to modify:**
1. Database migration -- update `handle_new_user()` trigger to support pre-assigned org_id
2. `src/pages/AdminCompaniesPage.tsx` -- add "New Company" dialog
3. `src/pages/AdminCompanyDetailPage.tsx` -- add "Add User" dialog

**No changes to:**
- Auth flow, existing RLS policies, existing edge functions, sidebar, or routing
