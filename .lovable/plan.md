
Fix the auth/session race rather than the approval workflow itself.

What I found
- The currently logged-in account already has a company assigned and a privileged role, with no pending join request in the backend.
- So the `/pending` screen is incorrect for this user.
- The client snapshot shows the pending page stuck on “Checking your access status...” without the expected profile/join-request reads, which means that screen never got a reliable authenticated `user`.
- Root cause: `useAuth()` is being created separately in multiple places (`ProtectedRoute`, `ProtectedLayout`, `OrgProvider`, `useUserRole`, `PendingApprovalPage`). One instance can be authenticated while another still thinks `user=null`.
- Secondary bug: `useUserRole` and `useOrgContext` mark loading as finished too early when auth is still restoring, so `OrgGate` can wrongly redirect to `/pending`.

Implementation plan
1. Centralize auth state
   - Convert `src/hooks/useAuth.tsx` into a shared auth context/provider initialized once.
   - Keep the same `useAuth()` API (`{ user, loading }`) so the rest of the app stays compatible.
   - Wrap the app in `AuthProvider` from `src/App.tsx`.

2. Make dependent hooks wait for auth readiness
   - Update `src/hooks/useUserRole.ts` to use auth loading and avoid setting `loading=false` until auth is actually resolved.
   - Update `src/hooks/useOrgContext.tsx` to keep `loading=true` until auth is ready and the profile fetch completes.
   - Also clear org/name state explicitly when no org exists or a query fails.

3. Harden the pending approval page
   - Update `src/pages/PendingApprovalPage.tsx` to only query once auth is ready.
   - If the user already has an `org_id`, redirect immediately to `/dashboard`.
   - Add explicit error handling so the page cannot sit forever on the generic spinner.

4. Stabilize protected routing
   - Update `src/components/ProtectedLayout.tsx` so `OrgGate` only decides after auth, role, and org/profile loading are all complete.
   - This should stop the bad `/dashboard -> /pending` bounce and reduce the current redirect churn.

Files to update
- `src/hooks/useAuth.tsx`
- `src/App.tsx`
- `src/hooks/useUserRole.ts`
- `src/hooks/useOrgContext.tsx`
- `src/pages/PendingApprovalPage.tsx`
- `src/components/ProtectedLayout.tsx`

Technical note
- No database change is needed for this fix; the problem appears to be entirely client-side state synchronization.

Expected outcome
- Approved users go straight to `/dashboard`.
- Refreshing the app no longer drops approved users onto `/pending`.
- Real pending users still see the approval screen and polling continues to work.
- The “Checking your access status...” screen no longer gets stuck for already-approved users.
