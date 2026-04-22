

# Auth System Health Check + Two Fixes

## Status: Working (with 2 risks)

The signup/login pipeline is **functional and reliable** today:

- **8 users**, **8 profiles**, **8 roles** — perfect 1:1:1 ratio (no orphans, no duplicates, no missing roles)
- All accounts have an `org_id` assigned and a role (`super_admin`, `admin`, or `viewer`)
- The `on_auth_user_created` trigger on `auth.users` is installed and enabled — it correctly runs `handle_new_user()` on every signup
- Recent login for `rrojas@vixicom.com` succeeded (auth log shows `login` + `token_revoked` events at 14:41 UTC, status 200)
- Email/password, Google OAuth, invitation acceptance, and join-code flows are all wired

## Risks found (would cause real failures)

### Risk 1 — Signup confirmation message is misleading
`AuthPage.tsx` line 74 tells users: *"Check your email — we sent you a confirmation link."*

But Lovable Cloud auth has email auto-confirm enabled by default, so **no email is sent**. The user sees this message, waits forever, and never tries to log in. This explains a class of "I signed up but can't get in" reports.

**Fix:** Change the toast to *"Account created — you can sign in now."* and optionally auto-sign-in after signup.

### Risk 2 — Logged-in but unconfirmed users get stuck on `/auth`
After successful login, `AuthPage` calls `navigate("/dashboard")`, but if the user has no org (pending join request), `ProtectedLayout`'s `OrgGate` redirects them to `/pending`. This works, but creates a brief flash of the dashboard route. More importantly, if a user signs up **without** a join code, they end up with `org_id = NULL` and `role = viewer`, and the only way to surface that to them is the `/pending` page showing "No Company Assigned" — but they have to manually log in first to see it.

**Fix:** After signup without a join code, automatically sign them in and route to `/pending` so they see the "No Company Assigned" state immediately instead of being told to check email.

### Risk 3 (minor) — Invitation auto-accept on login is fragile
`AuthPage.tsx` lines 36–54 query `org_invitations` after login. If the user already has an `org_id`, accepting another invitation silently overwrites their org membership. Low likelihood, but worth a guard.

**Fix:** Skip invitation acceptance if the user already has an `org_id`.

## Files to change

- `src/pages/AuthPage.tsx`
  - Replace "Check your email" toast with a sign-in confirmation
  - After signup, call `signInWithPassword` automatically and route to `/dashboard` (which will redirect to `/pending` if needed)
  - Guard invitation acceptance behind a profile org check

## What I'm NOT changing

- Database trigger, profile creation logic, role assignment, RLS policies — all working correctly
- Google OAuth flow — working
- The `handle_new_user` function — already handles all 4 paths (invitation, admin-created, join-code, self-signup) correctly
- `ProtectedLayout` / `OrgGate` routing logic — working as designed

## Expected outcome

- New signups see accurate messaging and land on the correct page immediately
- No more "I signed up but nothing happened" confusion
- Existing users with org membership stay protected from accidental invitation overwrites

