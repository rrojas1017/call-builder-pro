

## Redesign the Calls Page -- Full Analytics Dashboard

### What's Wrong Now
- Just a flat list of call IDs with no summary metrics
- The US map shows call counts but you can't click a state to drill into it
- No conversion rate tracking (qualified vs disqualified vs no answer)
- No aggregate stats (total minutes, avg duration, avg scores)
- Call list shows truncated IDs instead of useful info (contact name, date, state)
- No filtering or sorting capability
- Overall feels like a developer debug view, not a polished analytics page

### Redesigned Layout

The page will be restructured into three sections:

**Section 1: Summary KPI Cards (top row)**
Four cards across the top:
- Total Calls (count)
- Total Minutes (sum of duration)
- Avg Score (average of evaluation.overall_score)
- Conversion Rate (qualified / total completed calls as %)

**Section 2: Analytics Row (middle)**
Two side-by-side panels:
- Left: Interactive US Map -- clicking a state filters the call list below. Shows a tooltip with state name, call count, qualified count, and conversion rate for that state.
- Right: Outcome Breakdown -- a donut/pie chart showing distribution across completed, qualified, disqualified, no_answer, failed, etc.

**Section 3: Call Table (bottom)**
Replace the raw list with a proper data table:
- Columns: Date/Time, Contact (name from extracted_data or phone), State, Duration, Outcome, Score, Actions (view detail)
- Sortable by date, duration, score
- Filterable by outcome (dropdown) and state (via map click or dropdown)
- Clicking a row opens the existing detail panel as a slide-over sheet instead of shrinking the list

### State Drill-Down
- Clicking a state on the map filters the table to only show calls from that state
- A "breadcrumb" chip appears showing the active state filter with an X to clear it
- The KPI cards update to reflect the filtered data

### Technical Details

**File: `src/pages/CallsPage.tsx`** -- Full rewrite of the page component:
- Add `useMemo` aggregations for KPI calculations (total calls, total minutes, avg score, conversion rate)
- Add `selectedState` filter state that the map and table share
- Add `outcomeFilter` state for dropdown filtering
- Add `sortField` / `sortDirection` state for table column sorting
- Compute per-state stats (calls, qualified, conversion rate) passed to the map for richer tooltips
- Use Card components for KPI row
- Use Table components for the call list
- Use Sheet (slide-over) for call detail instead of the current side-panel approach
- Format dates with `date-fns` (already installed)
- Show contact name from `extracted_data.name` or fallback to phone/ID

**File: `src/components/USMapChart.tsx`** -- Enhance with:
- `onStateClick` callback prop so clicking a state triggers filtering
- `selectedState` prop to highlight the active state
- Enhanced tooltip showing calls, qualified, and conversion rate per state
- Accept a richer data shape: `Record<string, { calls: number; qualified: number }>` instead of just counts

**No database changes needed** -- all data already exists in the `calls` table (outcome, duration_seconds, evaluation, extracted_data with state info).

### What You'll See After
- A polished dashboard-style page with clear KPIs at the top
- An interactive map where clicking a state filters everything below it
- A proper sortable/filterable table showing meaningful call info
- Conversion rates visible at both the global and per-state level
- A clean slide-over panel for call details instead of the cramped side panel
