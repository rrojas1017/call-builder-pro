

## Add Concurrent Call Limits to Campaigns

### Current State
- The `campaigns` table already has a `max_concurrent_calls` column (integer, default 1)
- **Problem**: `tick-campaign` ignores this value entirely -- it fetches ALL queued contacts and dispatches them in a single batch
- The campaign creation UI never lets users set this value

### Changes

#### 1. Enforce concurrency in `tick-campaign` edge function

**File:** `supabase/functions/tick-campaign/index.ts`

Before fetching queued contacts, count how many contacts are currently in `calling` status. Then only dispatch enough contacts to fill the remaining slots.

```text
// Count currently active calls
const { count: activeCalls } = await supabase
  .from("contacts").select("id", { count: "exact", head: true })
  .eq("campaign_id", campaign_id).eq("status", "calling");

const slotsAvailable = campaign.max_concurrent_calls - (activeCalls || 0);
if (slotsAvailable <= 0) {
  return "All concurrent slots busy";
}

// Fetch only as many queued contacts as we have slots for
const { data: contacts } = await supabase
  .from("contacts").select("*")
  .eq("campaign_id", campaign_id).eq("status", "queued")
  .order("created_at", { ascending: true })
  .limit(slotsAvailable);
```

This applies to both the Bland and Retell branches since the contact fetching happens before the provider split.

#### 2. Add concurrency input to campaign creation UI

**File:** `src/pages/CampaignsPage.tsx`

- Add a `maxConcurrent` state variable (default 5)
- Add a number input field labeled "Max Concurrent Calls" in the create campaign form
- Pass the value when inserting the campaign: `max_concurrent_calls: maxConcurrent`

#### 3. Add concurrency display + edit on campaign detail page

**File:** `src/pages/CampaignDetailPage.tsx`

- Show the current `max_concurrent_calls` value near the campaign header
- Allow editing it (with a save button) so users can throttle up/down while a campaign is running

### How It Works After This Change

```text
Campaign has 100 contacts, max_concurrent_calls = 10

Tick 1: 0 active -> dispatch 10
Tick 2: 8 still calling -> dispatch 2
Tick 3: 10 still calling -> dispatch 0 (all slots busy)
Tick 4: 3 still calling -> dispatch 7
... until all contacts are processed
```

The campaign will need to be "ticked" repeatedly (either manually or via a scheduler) to process all contacts in waves. Each tick respects the concurrency limit.

### Technical Summary

| File | Change |
|---|---|
| `supabase/functions/tick-campaign/index.ts` | Count active calls, calculate available slots, limit queued contact fetch to available slots |
| `src/pages/CampaignsPage.tsx` | Add `maxConcurrent` state and number input in create form, pass to insert |
| `src/pages/CampaignDetailPage.tsx` | Display and allow editing of `max_concurrent_calls` |

