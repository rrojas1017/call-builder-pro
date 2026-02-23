

## Remove "Fix All Transfer Agents" Banner

Remove the one-time "Fix All Now" banner and related state/handler from `src/pages/AgentsPage.tsx`.

### Changes to `src/pages/AgentsPage.tsx`
- Remove the `fixingTransfer` state variable
- Remove the `handleFixTransfer` async function
- Remove the `provisionedCount` variable
- Remove the banner JSX block (the amber-colored "Fix transfer agent flags..." section)
- Remove the unused `RefreshCw` icon import if no longer needed (still used by Sync banner, so keep it)

This is a straightforward cleanup -- no other files are affected.

