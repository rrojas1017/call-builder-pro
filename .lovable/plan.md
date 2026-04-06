

# Fix Campaign Stalling: Stale Call Recovery + Independent Tick Loop

## Problem
The campaign ticker only fires when a webhook comes back from a completed call. If Retell fails to send a webhook for even one call, the entire campaign stalls permanently. Right now, contact `+18632470817` has been stuck in "calling" for 1.5+ hours, blocking all 358 remaining contacts.

## Two fixes needed

### 1. Stale call timeout in `tick-campaign`
Before checking available slots, scan for contacts stuck in "calling" for more than 10 minutes and mark them as `no_answer` (or a new `timeout` status). This frees the concurrency slot automatically.

**File: `supabase/functions/tick-campaign/index.ts`**
- After fetching the campaign and before counting active calls, add a query:
  ```sql
  UPDATE contacts SET status = 'no_answer', outcome = 'timeout'
  WHERE campaign_id = ? AND status = 'calling'
  AND called_at < now() - interval '10 minutes'
  ```
- Log how many stale contacts were recovered
- This ensures even if a webhook is lost, the campaign self-heals on the next tick

### 2. Self-sustaining tick loop via `setInterval` in `start-campaign`
Instead of relying solely on webhook-driven ticks, add a polling mechanism so the campaign keeps ticking independently.

**File: `supabase/functions/start-campaign/index.ts`**
- After the initial tick, fire a background polling loop: invoke `tick-campaign` every 30 seconds for the duration of the campaign
- Use a simple approach: after `start-campaign` does its initial tick, schedule a Supabase `pg_cron` job or use a client-side polling approach

**Better approach — client-side polling (simpler, no pg_cron needed):**

**File: `src/pages/CampaignDetailPage.tsx`**
- When the campaign status is "running", set up a 30-second interval that calls `tick-campaign` via the edge function
- This already partially exists (the page polls for contact status every 5 seconds) — add a tick invocation every 30 seconds alongside it
- Stop the interval when campaign is paused/completed

### 3. Immediate fix for current stall
- The stale-call timeout in the updated `tick-campaign` will automatically recover the stuck contact on the next invocation
- The client-side polling will ensure that invocation happens within 30 seconds of deploying

## Files to change
- `supabase/functions/tick-campaign/index.ts` — add stale call recovery (10-min timeout)
- `src/pages/CampaignDetailPage.tsx` — add 30-second tick polling for running campaigns

## Expected outcome
- Campaigns never permanently stall from a missed webhook
- Stuck "calling" contacts auto-recover after 10 minutes
- The current campaign (CMP-0004) will resume dialing within 30 seconds of deployment

