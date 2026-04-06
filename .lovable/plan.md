

# Auto-Complete Campaigns, Smart Reset, and Reporting Hub

## Three features to build

### 1. Campaign auto-stops when completed + smart reset
**Current behavior**: `tick-campaign` already marks campaigns as "completed" when no queued/calling contacts remain. The UI shows a Reset button for completed campaigns. However, the reset re-queues ALL contacts including successful ones.

**Fix**: Update `handleReset` in `CampaignDetailPage.tsx` to skip contacts whose associated call outcome is "qualified" or "transfer_completed". These contacts keep their current status. Only non-successful contacts get re-queued. Add a confirmation dialog that shows how many will be re-queued vs. skipped.

### 2. New Reporting Page (`/reports`)
Create `src/pages/ReportsPage.tsx` — a dedicated analytics hub with three tabs:

- **By Campaign**: Table of all campaigns with key metrics (total contacts, connection rate, qualification rate, avg duration, avg score, cost). Click a row to drill into campaign detail.
- **By List**: Table of all lists showing cross-campaign performance (penetration, conversion, DNC rate, avg duration). Shows which campaigns used each list.
- **By Agent**: Table of all agents with aggregated call stats (total calls, qualification rate, avg score, avg duration, top outcomes).

Each tab includes:
- Date range filter (7d, 30d, 90d, all)
- Summary cards at top (total calls, total qualified, overall conversion, total cost)
- Sortable columns

### 3. AI Campaign Insights
At the bottom of the Reports page, add an "AI Insights" section. On-demand button that:
- Calls a new edge function `generate-campaign-insights` which:
  - Fetches aggregate stats across campaigns, lists, and agents
  - Sends them to Gemini Flash with a prompt to analyze patterns and suggest improvements
  - Returns 3-5 actionable recommendations (e.g., "Lists from 407 area codes convert 2x better — focus acquisition there", "Agent Ashley performs best with 1.1x speaking speed")
- Displays insights as cards with icons

## Technical changes

### File: `src/pages/CampaignDetailPage.tsx`
- Update `handleReset` to query `calls` table for contacts with outcome "qualified" or "transfer_completed", exclude those contact IDs from the re-queue update.
- Update the reset confirmation dialog to show "X contacts will be re-queued, Y successful contacts will be preserved."

### New file: `src/pages/ReportsPage.tsx`
- Fetches `campaigns`, `dial_lists`, `agent_projects`, `calls`, and `contacts` tables
- Three tabs with sortable tables and summary stat cards
- Date range filter applied to calls.created_at
- AI Insights button at bottom calling the edge function

### New file: `supabase/functions/generate-campaign-insights/index.ts`
- Receives `org_id` and optional date range
- Aggregates: campaigns (count, conversion rates), lists (penetration, DNC rates), agents (scores, durations)
- Sends to Gemini Flash via `callAI` with structured output (array of insight objects: title, description, category)
- Returns insights array

### File: `src/App.tsx`
- Add route: `/reports` → `ReportsPage`

### File: `src/hooks/useSidebarConfig.ts`
- Add "Reports" item to the MONITOR section (between Calls and CRM)

