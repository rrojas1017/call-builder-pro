

## Multi-Tenant Platform: Team Management, Role Assignment, and Stripe Top-Up

### Overview

This plan adds three capabilities to the platform without touching any existing functionality:
1. **Team Management** -- Admins can invite users to their organization, assign roles, and remove members
2. **Organization Credits Balance** -- Track a credit balance per organization that gets deducted when calls are made
3. **Stripe Top-Up** -- Companies can purchase credits via Stripe Checkout

All changes are additive. Existing RLS policies, edge functions, and UI pages remain untouched.

---

### Part 1: Database Changes (Additive Only)

**Add columns to `organizations`:**
- `credits_balance` (numeric, default 0) -- current credit balance in USD
- `stripe_customer_id` (text, nullable) -- links org to Stripe customer

**Create new table `org_invitations`:**
- `id` (uuid, PK)
- `org_id` (uuid, FK to organizations)
- `email` (text, not null) -- invited user's email
- `role` (app_role, default 'viewer')
- `status` (text, default 'pending') -- pending, accepted, expired
- `invited_by` (uuid, FK to auth.users)
- `created_at` (timestamptz, default now())
- `expires_at` (timestamptz, default now() + 7 days)

RLS on `org_invitations`:
- SELECT: org members can view their org's invitations
- INSERT/UPDATE/DELETE: admins and super_admins of the org only

**Create new table `credit_transactions`:**
- `id` (uuid, PK)
- `org_id` (uuid, FK to organizations)
- `amount` (numeric, not null) -- positive for top-ups, negative for usage
- `type` (text) -- 'topup', 'call_charge', 'refund'
- `description` (text, nullable)
- `stripe_session_id` (text, nullable)
- `created_at` (timestamptz, default now())

RLS on `credit_transactions`:
- SELECT: org members can view their org's transactions
- INSERT/UPDATE/DELETE: none from client (service role only via edge functions)

**New RLS policy on `profiles`:**
- Admins can view all profiles within their org (needed for team member list)

**New RLS policies on `user_roles`:**
- Admins can view roles for users in their org
- Admins can insert/update/delete roles for users in their org (via security definer function to prevent privilege escalation)

**New RLS policy on `organizations`:**
- Admins can update their own org (for name changes)

**Security definer function `manage_team_member_role`:**
- Takes target_user_id, new_role, action (assign/remove)
- Validates caller is admin/super_admin of the same org
- Prevents removing your own admin role
- Prevents assigning super_admin (reserved for platform owner)

**Security definer function `accept_invitation`:**
- Called by the invited user after sign-up
- Moves their profile to the inviting org
- Sets their role per the invitation
- Marks invitation as accepted

---

### Part 2: Stripe Integration for Top-Up

**Enable Stripe** using the Stripe tool (collects secret key).

**New edge function `create-topup-session`:**
- Receives `amount` (USD) from the frontend
- Looks up or creates a Stripe customer for the org (using `stripe_customer_id`)
- Creates a Stripe Checkout Session in "payment" mode with the specified amount
- Returns the checkout URL
- Stores `stripe_customer_id` on the organization if newly created

**New edge function `stripe-webhook`:**
- Listens for `checkout.session.completed` events
- Verifies the Stripe signature
- Credits the organization's balance: increments `credits_balance` and inserts a `credit_transactions` record
- Configured with `verify_jwt = false` (public webhook endpoint)

**Modified edge functions (additive balance check):**
- `run-test-run` and `tick-campaign`: Before initiating calls, check `credits_balance > 0` on the org. If insufficient, return an error instead of placing calls. This is a simple `if` check added before the existing call logic -- no existing code is modified.

---

### Part 3: Frontend Changes

**New page: `TeamPage.tsx` (route: `/team`)**
- Lists all members of the current organization with their roles
- "Invite Member" button opens a dialog: email + role selector (admin, analyst, viewer)
- Role change dropdown per member (admins only)
- Remove member button (admins only)
- Shows pending invitations with ability to cancel

**New page: `BillingPage.tsx` (route: `/billing`)**
- Shows current credit balance prominently
- "Add Credits" button with preset amounts ($25, $50, $100, $250) or custom amount
- Clicking redirects to Stripe Checkout
- Transaction history table showing all top-ups and charges
- Auto-refreshes balance after returning from Stripe

**Modified: `SettingsPage.tsx`**
- Add tabs or sections: "Profile", with links to "Team" and "Billing" pages
- Keep existing profile editing exactly as-is

**Modified: `AppSidebar.tsx`**
- Add "Team" under the SYSTEM section (icon: Users)
- Add "Billing" under the SYSTEM section (icon: CreditCard)

**Modified: `AuthPage.tsx`**
- After successful sign-up, check for pending invitations matching the user's email
- If found, call `accept_invitation` to join the existing org instead of creating a new one

---

### Part 4: Invitation Flow

When an admin invites someone:
1. A row is inserted into `org_invitations`
2. If the invited email already has an account, they see a notification on next login
3. If they don't have an account, they sign up normally, and the `accept_invitation` function checks for pending invitations and assigns them to the correct org with the correct role

---

### Files to Create
1. `src/pages/TeamPage.tsx` -- Team management UI
2. `src/pages/BillingPage.tsx` -- Credits balance and top-up UI
3. `supabase/functions/create-topup-session/index.ts` -- Stripe Checkout session creator
4. `supabase/functions/stripe-webhook/index.ts` -- Stripe webhook handler

### Files to Modify (Additive Only)
1. `src/App.tsx` -- Add routes for `/team` and `/billing`
2. `src/components/AppSidebar.tsx` -- Add Team and Billing nav items
3. `src/pages/AuthPage.tsx` -- Check for pending invitations after sign-up/login
4. `supabase/functions/run-test-run/index.ts` -- Add balance check before calls
5. `supabase/functions/tick-campaign/index.ts` -- Add balance check before calls
6. `supabase/config.toml` -- Add new function configs
7. Database migration -- New tables, columns, functions, and RLS policies

### What Stays Completely Unchanged
- All existing edge functions (receive-bland-webhook, receive-retell-webhook, evaluate-call, etc.)
- All existing RLS policies on existing tables
- All existing UI pages and components
- The `handle_new_user` trigger (still creates org + profile + admin role for new sign-ups without invitations)
- All existing database columns and their types

### Risk Summary

| Area | Risk | Mitigation |
|------|------|------------|
| Existing auth flow | None | Invitation check is additive; default path unchanged |
| Existing RLS | None | No policies are modified, only new ones added |
| Call dispatching | Low | Balance check is a simple guard before existing logic |
| Existing pages | None | No existing pages are modified beyond adding nav links |
| Role escalation | None | `manage_team_member_role` is security definer with server-side validation |

