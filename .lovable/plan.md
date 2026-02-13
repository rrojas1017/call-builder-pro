

## Improve User Creation Flow (No Email Service)

### Problem
The Team page currently only offers "Invite Member" which creates an `org_invitations` record -- but since there is no email service configured, the invited user never receives the invitation email, making this flow broken. Meanwhile, the direct user creation (email + password) only exists on the super-admin Company Detail page.

### Solution
Add a **"Create User"** button on the Team page that lets admins directly create users with credentials (email, password, full name, role) using the existing `create-user` edge function. The invite flow will be kept but deprioritized.

### Changes

**`src/pages/TeamPage.tsx`**
- Add a new "Create User" dialog (similar to the one on `AdminCompanyDetailPage`) with fields: email, full name, password, role
- Wire it to call `supabase.functions.invoke("create-user", { body: { email, password, full_name, org_id: activeOrgId, role } })`
- After successful creation, show a toast with the credentials so the admin can copy/share them with the new user
- Include a "Copy credentials" button in the success state so rrojas can easily send login details
- Keep the existing "Invite Member" button but make "Create User" the primary action
- Only show the "Create User" button for users with admin or super_admin role (using `useUserRole`)

**`supabase/functions/create-user/index.ts`**
- Update the authorization check to also allow `admin` role (not just `super_admin`), but restrict admins to only create users within their own organization
- Add a check: if caller is `admin` (not super_admin), verify the `org_id` in the request matches the caller's own org

### User Experience
1. Admin clicks "Create User" on Team page
2. Fills in email, full name, password, role
3. On success, a confirmation dialog shows the credentials with a "Copy to clipboard" button
4. Admin shares credentials with the new team member directly (e.g., via chat, phone)

### Technical Details
- The `create-user` edge function already handles user creation with `adminClient.auth.admin.createUser` and sets `email_confirm: true` (skipping email verification)
- The `handle_new_user` trigger assigns the user to the correct org and role based on `user_metadata`
- No new database tables or migrations needed

