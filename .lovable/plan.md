

## Calls Command Center -- Complete Rebuild

### Overview

Rebuild the entire Calls section (`CallsPage.tsx` + `USMapChart.tsx`) from scratch into a proper analytics command center. The map gets interactive multi-metric support and drill-down, while the call list gets search, filters, audio playback, chat-style transcripts, and summary stats.

### Reality Check: Map Data

Right now only 3 out of 100 calls have a linked contact with a phone number (from campaigns). The rest are test calls with no `contact_id`. The area code approach is correct and will populate naturally as more campaign calls are made. The map will show an "empty state" message when data is sparse, and grow richer over time.

---

### Part 1: Enhanced US Map (`src/components/USMapChart.tsx`)

**New props interface:**
```text
stateData: Record<string, {
  calls: number;
  conversionRate: number;
  avgScore: number | null;
  avgDuration: number;
}>
metric: "calls" | "conversion" | "score" | "duration"
onMetricChange: (metric) => void
selectedState: string | null
onStateClick: (abbr | null) => void
```

**Features:**
- Metric selector tabs above the map: Call Volume, Conversion %, Avg Score, Avg Duration
- Color gradients per metric:
  - Volume: teal gradient (current style)
  - Conversion: green gradient
  - Score: blue-purple gradient
  - Duration: amber gradient
- Click a state to filter (passes `onStateClick` up to CallsPage)
- Selected state gets a highlighted border and can be cleared
- Rich tooltips showing all 4 metrics for the hovered state
- Color scale legend bar below the map
- Empty state message when fewer than 3 states have data: "Map populates as campaign calls increase"

### Part 2: Rebuilt Calls Page (`src/pages/CallsPage.tsx`)

Complete rewrite with these sections:

**A. Summary Stats Row (4 cards)**
- Total Calls (filtered count)
- Avg Duration (formatted as m:ss)
- Avg Score (color-coded)
- Conversion Rate (qualified / total %)

All stats update dynamically based on active filters.

**B. Filter Bar**
- Text search input (filters transcript content, client-side)
- Direction tabs: All / Outbound / Inbound
- Outcome multi-select dropdown: qualified, completed, voicemail, busy, failed
- Score quick filters: All, 80+, 50-79, Below 50
- Duration quick filters: All, 30s+, 1min+, 5min+
- "Showing calls from [State] -- Clear" banner when map state is selected

**C. Call List (left panel when detail is open)**
- Shows: direction icon, agent name (from `agent_projects`), outcome badge, duration, score, relative timestamp, provider badge
- Pagination: Load 50 at a time with "Load More" button
- CSV export button in the header

**D. Detail Panel (right side)**

When a call is clicked, the map hides and the list shrinks to a sidebar:

1. **Header**: Agent name, direction, relative timestamp, close button
2. **Metric cards** (3 cols): Outcome, Duration, Score
3. **Call Timeline**: Horizontal visual showing Created, Started, Ended with time labels and duration badge
4. **Audio Player**: HTML5 audio element with playback speed controls (1x, 1.25x, 1.5x, 2x) -- only when `recording_url` exists
5. **Evaluation section**: Compliance/Objective/Overall score cards, hallucination alert, issues list, recommended improvements with Apply buttons (preserving existing improvement logic)
6. **Voice Recommendation**: Same card as current
7. **Chat-Style Transcript**: Parse "Agent: ... / User: ..." lines into chat bubbles with Bot/User icons (reuse pattern from `LiveCallMonitor`)
8. **Extracted Data**: Collapsible JSON viewer

### Part 3: Data Fetching Strategy

**Query**: Fetch calls with contact phone via join:
```text
calls(*, contacts(phone))
```

**Agent names**: Fetch `agent_projects(id, name)` once and build a lookup map for `project_id` to agent name.

**State derivation**: Use `phoneToState(contact.phone)` from the existing `areaCodeToState.ts` utility for each call that has a contact.

**Per-state metrics**: Computed in a `useMemo` from filtered calls -- aggregate calls, conversion rate, avg score, avg duration per state.

### Technical Summary

| File | Change |
|------|--------|
| `src/components/USMapChart.tsx` | Rewrite: multi-metric support, click handler, color gradients per metric, legend, enriched tooltips, selected state highlight, empty state |
| `src/pages/CallsPage.tsx` | Rewrite from scratch: stats row, filter bar, search, pagination, audio player, chat transcript, CSV export, timeline, state filtering, agent name resolution |
| `src/lib/areaCodeToState.ts` | Already exists -- no changes needed |
| Database | No changes -- uses existing join to contacts table |

### What This Delivers

- A professional analytics dashboard for the Calls section
- Interactive map that filters the call list by state
- Toggle between Volume, Conversion, Score, and Duration heat maps
- Audio playback with speed control for call recordings
- Chat-style transcript view instead of raw text
- Powerful filtering across outcome, score, duration, direction, and text search
- Summary stats that update as you filter
- CSV export for reporting
- All built on existing data -- no backend changes needed

