

# Add Per-Call Cost Detail Report to Cost Audits

## Overview
Add a new "Call Detail Report" section below the existing per-org breakdown table. This will show individual call records sorted by cost (most expensive first), so you can identify which specific calls are driving spend.

## What You'll See

The new section will include:
- A sortable table of individual calls with columns: Date, Organization, Agent, Duration, Cost, Cost/Min, Outcome, Direction
- Sorted by cost descending by default (most expensive calls first)
- Respects the existing period filter (Today, 7D, 30D, All Time)
- A search filter to find calls by org or agent name
- Color-coded cost column to highlight expensive calls (e.g., red for calls over $1)
- Pagination (showing 50 calls at a time with load-more)

## Technical Details

### File: `src/pages/CostAuditsPage.tsx`

**Data fetching changes:**
- Expand the existing `loadCosts` query to also fetch individual call details: `id, started_at, duration_seconds, cost_estimate_usd, org_id, project_id, outcome, direction`
- Store the raw call rows in a new `callDetails` state array
- Reuse the already-fetched org name map and add agent project name lookups (already done for `agent_projects`)

**New UI section (below per-org breakdown):**
- "Call Detail Report" heading with a search input
- Table columns: Date/Time, Organization, Agent, Duration (min), Cost ($), $/Min, Outcome, Direction
- Rows sorted by `cost_estimate_usd` descending
- Show top 50 rows initially with a "Load more" button
- Calls costing > $1 get a red highlight; calls > $0.50 get amber

**No new files needed** -- all changes are within `CostAuditsPage.tsx`, keeping it self-contained.

**No database or backend changes required** -- all data already exists in the `calls` table with proper RLS policies for super_admins.
