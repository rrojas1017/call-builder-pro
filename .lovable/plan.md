

## Fix: Force Cancel Reverts Because Polling Overwrites Local State

### Problem

When you click "Force Cancel", the UI updates optimistically (contact status changes to "cancelled"), but 5 seconds later the polling interval re-fetches all contacts from the database and overwrites the local state. If there's any timing issue (or if the database update didn't actually persist due to RLS), the contact snaps back to "calling".

### Root Cause

Two issues working together:

1. The 5-second polling interval (line 112) unconditionally replaces all contacts with fresh database data, discarding any optimistic updates
2. The database update uses the client-side Supabase client, but the RLS policy on `contacts` requires admin/super_admin role -- if the role check fails, the update silently does nothing (Supabase returns success with 0 rows affected)

### Fix

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Use `.select()` after the update** to confirm the row was actually changed. If 0 rows returned, show an error toast instead of pretending it worked.

2. **After a successful force-cancel, immediately trigger a fresh poll** instead of relying on optimistic state that will be overwritten. This way the poll itself confirms the new status.

3. **Add a recently-cancelled set** -- after force-cancelling, add the contact ID to a ref. In the polling callback, merge the poll results with the local overrides for contacts cancelled in the last 10 seconds. This prevents the flicker even if the DB read is slightly stale.

```text
handleForceCancel:
  1. Update contacts row, append .select() to confirm
  2. If no rows returned -> toast error "Could not cancel - permission denied"
  3. If success -> add contactId to recentlyCancelled ref with timestamp
  4. Trigger immediate re-fetch

Polling callback:
  1. Fetch contacts from DB as before
  2. For each contact in recentlyCancelled (within last 10s), override status to "cancelled"
  3. Clean up entries older than 10s
```

### Technical Summary

| Area | Change |
|---|---|
| `handleForceCancel` | Add `.select()` to confirm update; add to `recentlyCancelledRef` |
| Polling `useEffect` | Merge `recentlyCancelledRef` overrides into fetched contacts before setting state |
| New ref | `useRef<Map<string, number>>` to track recently cancelled contact IDs + timestamps |

This is a ~15 line change in a single file.
