

## Super Admin Console and Company Onboarding

### Overview

This plan adds two major capabilities:

1. **Super Admin Console** -- A company/org switcher and management panel so super admins (like rrojas@vixicom.com) can browse all organizations, view their data, and manage their users for support purposes.
2. **Company Onboarding for Admins** -- When a new admin signs up, they must set their company name before accessing the platform. The organization name field on Settings becomes editable for admins.

### How It Works

**Super Admin Experience:**
- A new "Companies" page at `/admin/companies` lists all organizations with member counts, credit balances, and agent counts.
- Clicking a company lets the super admin "impersonate" that org -- the sidebar shows which company they're viewing, and all data pages (Dashboard, Agents, Campaigns, Calls, etc.) show that org's data instead.
- A persistent banner/chip in the sidebar shows the currently-viewed org with a button to return to their own org.
- From the company detail view, the super admin can see/edit members, change roles, and view billing history.

**Regular Admin Experience:**
- After sign-up, if the organization name still ends with `'s Org` (the auto-generated default), they are redirected to a one-time onboarding step to set their company name.
- Settings page lets admins edit the organization name.
- Billing page remains as-is -- admins add credits via Stripe.

### Part 1: Database Changes

**New RLS policies on `organizations`:**
- Super admins can SELECT all organizations (needed for the admin console).

**New RLS policies on `profiles`:**
- Super admins can SELECT all profiles (needed to list members across orgs).

**New RLS policies on `user_roles`:**
- Super admins can SELECT all user roles.

**New security definer function `switch_org_context`:**
- Takes an org_id parameter.
- Validates caller has `super_admin` role.
- Returns the org details (no actual state change on the server -- the context switch is client-side only, using the org_id to filter queries).

**No new tables needed** -- this uses existing `organizations`, `profiles`, and `user_roles` tables.

### Part 2: Super Admin Context Provider

**New file: `src/hooks/useOrgContext.tsx`**
- A React context that stores the "active org_id" for the current session.
- For regular users, this is always their own org_id from their profile.
- For super admins, this can be switched to any org_id.
- Provides `activeOrgId`, `isImpersonating`, `switchOrg(orgId)`, and `resetOrg()`.
- All data-fetching pages will read `activeOrgId` from this context instead of fetching it from the profile every time.

**Modified: `src/components/ProtectedLayout.tsx`**
- Wrap the layout with the OrgContext provider.
- After loading the user's profile and role, set the default org_id.

### Part 3: Super Admin Pages

**New page: `src/pages/AdminCompaniesPage.tsx` (route: `/admin/companies`)**
- Lists all organizations with columns: Name, Members count, Agents count, Credit Balance, Created date.
- Search/filter by company name.
- Click a row to switch context to that org (sets `activeOrgId`), then redirects to `/dashboard`.
- "Edit" button opens a dialog to rename the org or manage its members.

**New page: `src/pages/AdminCompanyDetailPage.tsx` (route: `/admin/companies/:orgId`)**
- Shows the selected org's details: name, balance, Stripe customer ID.
- Members table with role management (same UI as TeamPage but for any org).
- Quick links to view that org's agents, campaigns, calls (switches context and navigates).

### Part 4: Sidebar Changes

**Modified: `src/components/AppSidebar.tsx`**
- Add an "ADMIN" nav section (only visible to super_admins) with a "Companies" link.
- When impersonating another org, show a colored banner at the top of the sidebar: "Viewing: [Org Name]" with an "Exit" button to return to own org.
- The sidebar needs to know the user's role. Add a `useUserRole` hook or extend `useAuth`.

### Part 5: Update Data Pages to Use OrgContext

**Modified pages** (minimal changes -- replace the pattern of fetching `profile.org_id` with reading from `useOrgContext`):
- `DashboardPage.tsx` -- use `activeOrgId` instead of `profile.org_id`
- `AgentsPage.tsx` -- already filtered by RLS, but super admin RLS needs to see all
- `CallsPage.tsx`, `CampaignsPage.tsx`, `ListsPage.tsx`, etc.

For super admins viewing another org, the approach is:
- The context provides the `activeOrgId`.
- Pages that explicitly filter by `org_id` (like Dashboard, Calls) use `activeOrgId`.
- Pages that rely on RLS joins through `agent_projects.org_id` need super admin SELECT policies added.

**New RLS policies for super admin cross-org access:**
- `agent_projects`: super admins can SELECT all.
- `agent_specs`: already uses join to `agent_projects`, so covered.
- `calls`: super admins can SELECT all.
- `campaigns`: super admins can SELECT all (via agent_projects join).
- `contacts`: super admins can SELECT all (via campaigns join).
- `dial_lists`: super admins can SELECT all.
- `credit_transactions`: super admins can SELECT all.

### Part 6: Company Onboarding

**New component: `src/components/CompanyOnboardingModal.tsx`**
- A modal/dialog that appears when `org.name` matches the auto-generated pattern (`*'s Org`).
- Fields: Company Name (required).
- On submit, updates `organizations.name` via Supabase.
- Only shown once -- after setting the name, it never appears again.

**Modified: `src/components/ProtectedLayout.tsx`**
- After loading the user's org, check if the org name matches the default pattern.
- If so, show the onboarding modal before rendering the main content.

### Part 7: Settings Page Enhancement

**Modified: `src/pages/SettingsPage.tsx`**
- Make the Organization name field editable for admins/super_admins.
- Add a Save button that updates `organizations.name`.

---

### Technical Summary

Files to create:
1. `src/hooks/useOrgContext.tsx` -- Org context provider with impersonation support
2. `src/hooks/useUserRole.ts` -- Hook to fetch current user's role
3. `src/pages/AdminCompaniesPage.tsx` -- All-companies list for super admins
4. `src/pages/AdminCompanyDetailPage.tsx` -- Company detail/management for super admins
5. `src/components/CompanyOnboardingModal.tsx` -- First-time company name setup

Files to modify:
1. `src/components/ProtectedLayout.tsx` -- Add OrgContext provider and onboarding check
2. `src/components/AppSidebar.tsx` -- Add ADMIN section and impersonation banner
3. `src/App.tsx` -- Add admin routes
4. `src/pages/DashboardPage.tsx` -- Use activeOrgId from context
5. `src/pages/SettingsPage.tsx` -- Editable org name for admins
6. `src/pages/BillingPage.tsx` -- Use activeOrgId from context
7. `src/pages/TeamPage.tsx` -- Use activeOrgId from context
8. Database migration -- Super admin RLS policies

### What stays unchanged:
- All existing RLS policies for regular users
- All edge functions
- Auth flow and invitation system
- All existing table schemas

