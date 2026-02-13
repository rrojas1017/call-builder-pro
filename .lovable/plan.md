

## Redesign Dashboard as a Holistic Agent Performance Hub

### What Changes
Replace the current 4-stat-card + empty-state dashboard with a modern, data-rich command center that surfaces agent performance, campaign results, call analytics, and conversion metrics -- all in one view. The dashboard adapts to show relevant data whether you have outbound campaigns, inbound calls, or both.

### Layout (Top to Bottom)

**Row 1 -- Header + Time Filter**
- Welcome greeting (existing)
- Period selector: Today / 7 Days / 30 Days / All Time (filters all dashboard data)

**Row 2 -- KPI Cards (6 cards, 3x2 grid on desktop)**
- Active Agents (count, with mode breakdown: outbound/inbound/hybrid)
- Total Calls (with delta % vs previous period, split: outbound vs inbound)
- Total Minutes (sum of `duration_seconds / 60`, with cost estimate from `cost_estimate_usd`)
- Conversion Rate (completed calls with positive outcome / total completed calls)
- Avg Score (mean of `evaluation.overall_score` across all evaluated calls)
- Active Campaigns (running campaigns count, with total contacts queued)

**Row 3 -- Two-Column Charts**
- Left: **Call Volume Over Time** -- Area/bar chart showing daily call count for the selected period, with outbound and inbound as stacked layers (uses recharts AreaChart)
- Right: **Outcome Distribution** -- Donut chart showing completed / failed / no_answer / qualified / disqualified breakdown

**Row 4 -- Two-Column Panels**
- Left: **Agent Leaderboard** -- Table ranking agents by conversion rate and avg score. Columns: Agent Name, Mode badge, Calls, Conversion %, Avg Score, Trend arrow. Clickable rows link to `/agents/:id/edit`
- Right: **Recent Calls** -- Compact list of last 10 calls with outcome badge, duration, score, and agent name. Clickable to `/calls`

**Row 5 -- Campaign Summary (conditionally shown if campaigns exist)**
- Horizontal scrollable cards for each active/recent campaign: name, status badge, progress bar (called/total contacts), conversion rate

**Empty State (only when zero agents exist)**
- The existing "Create Your First Agent" CTA card, but refined to match the new style

### Inbound Call Considerations
- All KPI cards and charts include inbound data via the `direction` column on the `calls` table
- The Call Volume chart uses separate colors for inbound vs outbound
- Agent Leaderboard shows mode badges (Outbound/Inbound/Hybrid) for each agent
- The Outcome Distribution chart includes all call directions

### Technical Details

**Files Modified:**
- `src/pages/DashboardPage.tsx` -- Complete rewrite with new sections and data fetching

**Data Queries (all within existing tables, no migrations needed):**
- `profiles` -- user greeting (existing)
- `agent_projects` + `agent_specs(mode)` -- agent count and mode breakdown
- `campaigns` -- active campaign count and status
- `calls` -- all analytics: counts, durations, outcomes, evaluations, direction, costs, timestamps
- `contacts` -- campaign progress (queued vs called vs completed counts)

**Dependencies used (all already installed):**
- `recharts` -- AreaChart for call volume, PieChart for outcome distribution
- `lucide-react` -- icons
- `date-fns` -- period filtering (startOfDay, subDays, etc.)
- Existing UI components: Card, Badge, Table, Tabs, Progress, Button

**Period Filtering Approach:**
- State variable `period` controls a date cutoff
- All queries filter by `created_at >= cutoff` for calls and campaigns
- KPI deltas compare current period vs previous equivalent period (e.g., last 7 days vs 7 days before that)

**Performance:**
- Single `useEffect` fetches all data in parallel with `Promise.all`
- Call data limited to 1000 rows (Supabase default) per query; for volume chart, group by date client-side
- Agent leaderboard computed client-side from calls data grouped by `project_id`

**No database migrations required** -- all data needed already exists in the current schema.

