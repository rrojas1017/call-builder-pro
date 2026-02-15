

## Fix Campaign Execution + Build Live Campaign Dashboard

### Problems Found

**1. Campaign has zero contacts (root cause: empty dial list rows)**

The list "Corrupted or Binary Excel Data" has `row_count: 6` but zero actual rows in `dial_list_rows`. The contact-copy loop in `CampaignsPage.tsx` ran but found nothing to copy. The campaign started with 0 contacts, so `tick-campaign` immediately sees "no queued contacts" and marks it completed.

**Fix**: After copying contacts, check if any were actually inserted. If zero, show an error toast and don't create the campaign, or warn the user.

**2. tick-campaign crashes with ambiguous FK error**

The query `select("*, agent_projects!inner(id, org_id)")` fails because `campaigns` has two foreign keys to `agent_projects`: `project_id` and `agent_project_id`. PostgREST can't pick one.

**Fix**: Change to `agent_projects!campaigns_agent_project_id_fkey` to disambiguate.

**3. Campaign Detail page is static and basic**

Currently loads data once on mount with no live updates, no call-level stats, no duration/score/conversion metrics.

### Solution

#### A. Fix tick-campaign FK disambiguation

In `supabase/functions/tick-campaign/index.ts` line 27, change the select to use the explicit FK hint.

#### B. Add contact-copy validation in CampaignsPage

After the contact copy loop, count how many contacts were inserted. If zero, delete the campaign and show an error: "No valid contacts found in the selected lists. Check that your lists have phone numbers."

#### C. Rebuild Campaign Detail as a Live Dashboard

Replace the basic `CampaignDetailPage.tsx` with a rich, real-time dashboard:

**Real-time data via Supabase Realtime**: Subscribe to `contacts` table changes filtered by `campaign_id` so the page updates live as calls complete.

**New KPI cards** (top row):
- Total Contacts (static)
- In Progress (contacts with status "calling")
- Completed (status "completed")
- Failed (status "failed")
- Success Rate (completed / (completed + failed) as %)
- Avg Duration (from `calls` table, `duration_seconds`)
- Avg Score (from `calls.evaluation->overall_score`)

**Progress bar**: Visual progress indicator showing % of contacts processed.

**Outcome distribution chart**: Existing pie chart but with live-updating data.

**Live contact feed**: Contacts table sorted by most recently updated, with status badges that update in real-time. Show duration and outcome when available by joining with `calls` data.

**Per-list breakdown**: Keep existing table but add success rate and avg duration per list.

**Campaign controls**: Add Start/Pause/Resume buttons directly on the detail page header.

### Technical Details

| File | Change |
|---|---|
| `supabase/functions/tick-campaign/index.ts` | Line 27: change `agent_projects!inner` to `agent_projects!campaigns_agent_project_id_fkey(id, org_id)` |
| `src/pages/CampaignsPage.tsx` | After contact copy loop, validate count > 0. If zero, delete campaign + campaign_lists rows and show error toast |
| `src/pages/CampaignDetailPage.tsx` | Full rebuild: add Realtime subscription on `contacts` table, add `calls` data fetch for duration/score/evaluation metrics, add progress bar, add campaign control buttons, add richer KPI cards, improve contact table with live status updates |

### Realtime Subscription Approach

```text
Channel: campaign-{id}
Table: contacts
Filter: campaign_id=eq.{id}
Events: UPDATE (status changes as calls complete)

On each event:
  - Update the contact in local state
  - Recalculate all derived stats (counts, rates, progress %)
```

The `calls` data (duration, scores, outcomes) will be fetched on initial load and periodically refreshed (every 15s while campaign is running) since calls are inserted by the webhook after contacts are updated.

