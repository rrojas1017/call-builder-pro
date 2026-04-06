

# Fix Auth Stability: Deduplicate Profile Loads and Eliminate Flicker

## Problem
After login, the `onAuthStateChange` listener fires multiple times (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED), each creating a new `user` object that re-triggers `useOrgContext`'s effect. This causes 15+ duplicate profile queries, brief loading flickers, and the "comes and goes" feeling.

## Changes

### 1. Stabilize user reference in `useAuth.tsx`
- Use a `ref` to track whether the initial session has been resolved
- Only call `setLoading(false)` once (from `getSession`), and let `onAuthStateChange` handle subsequent changes without resetting loading
- Compare `user.id` before calling `setUser` to avoid unnecessary re-renders when the same user is emitted multiple times

### 2. Deduplicate profile fetch in `useOrgContext.tsx`
- Depend on `user?.id` instead of `user` object in the effect dependency array — this prevents re-fetching when the same user object is re-created with a new reference
- Remove the `cancelled` pattern in favor of a simpler approach since the effect will only fire when user ID actually changes

### 3. Fix React ref warning in `ProtectedLayout.tsx`
- Wrap `OrgGate` with `React.forwardRef` or restructure so React Router doesn't try to pass a ref to a plain function component

## Files to update
- `src/hooks/useAuth.tsx`
- `src/hooks/useOrgContext.tsx`
- `src/components/ProtectedLayout.tsx`

## Expected outcome
- Login resolves in a single profile + role fetch (not 15+)
- No loading flicker between auth and dashboard
- Console warnings eliminated

