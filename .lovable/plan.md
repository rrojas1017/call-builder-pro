

## Fix: Contact List Truncation, Auto-Refresh, and Stuck Call Controls

### Issue 1: Contact List Cut Off at Bottom

The contacts table uses `<ScrollArea className="max-h-[400px]">` which doesn't properly constrain the scrollable area. The last rows get clipped without a visible scrollbar.

**Fix in `CampaignDetailPage.tsx`:**
- Change `max-h-[400px]` to `h-[400px]` on the ScrollArea so it becomes a fixed-height scrollable container
- This ensures all 11 contacts are accessible via scrolling

### Issue 2: Campaign Detail Not Auto-Refreshing

The periodic refresh interval (line 111) only runs when `campaign?.status === "running"`. Two problems:
- If the campaign is in any other state (e.g. "paused" but still has active calls), it won't refresh
- It only refreshes `calls` data, not `contacts` -- so contact status changes from webhooks may be missed if the realtime subscription drops

**Fix in `CampaignDetailPage.tsx`:**
- Remove the `campaign?.status !== "running"` guard -- always poll when there are in-progress contacts
- Also refresh contacts in the polling interval (not just calls)
- Keep the 5-second interval

### Issue 3: Cannot Stop Stuck "In Progress" Calls

The "Live Calls" panel (with stop buttons) only appears when contacts have `status === "calling"` AND `bland_call_id` is set. If `bland_call_id` wasn't stored on the contact record, the panel won't show -- leaving no way to stop them.

**Fix in `CampaignDetailPage.tsx`:**
- Relax the live calls filter: show contacts with `status === "calling"` even without `bland_call_id`
- For contacts without a `bland_call_id`, provide a "Force Cancel" button that sets the contact status to `cancelled` directly in the database (since there's no Bland call to terminate)
- This covers edge cases where the call record exists but the contact wasn't properly linked

### Technical Summary

| File | Change |
|---|---|
| `src/pages/CampaignDetailPage.tsx` | Fix ScrollArea height from `max-h-[400px]` to `h-[400px]` |
| `src/pages/CampaignDetailPage.tsx` | Remove status guard on polling interval; also refresh contacts in the poll |
| `src/pages/CampaignDetailPage.tsx` | Show "calling" contacts in Live Calls even without `bland_call_id`; add Force Cancel option |

