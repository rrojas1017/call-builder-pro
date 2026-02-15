

## Add Campaign Deletion

### What Changes

Add a **Delete** button to the campaign detail page header (next to Pause/Start). Clicking it opens a confirmation dialog. On confirm, the campaign row is deleted from the database and the user is redirected back to `/campaigns`.

### Cleanup (Already Handled)

The database foreign keys already handle cascading:
- `contacts` -- CASCADE (auto-deleted)
- `campaign_lists` -- CASCADE (auto-deleted)  
- `calls.campaign_id` -- SET NULL (calls preserved, campaign reference cleared)

No edge function or manual cleanup needed.

### Technical Details

| File | Change |
|---|---|
| `src/pages/CampaignDetailPage.tsx` | Add `Trash2` icon import, `AlertDialog` import, delete handler function, and a red Delete button in the header that triggers a confirmation dialog. On confirm, runs `supabase.from("campaigns").delete().eq("id", id)` then navigates to `/campaigns`. |

The confirmation dialog will use the existing `AlertDialog` component with:
- Title: "Delete Campaign"
- Description: "This will permanently delete this campaign and all its contact data. Call records will be preserved. This action cannot be undone."
- Cancel + destructive Delete button

The Delete button will only appear when the campaign is **not running** (statuses: draft, paused, completed, failed).

