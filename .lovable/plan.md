

## Add Call Distribution by Region Map to Calls Page

### Overview
Add a US map visualization to the Calls page showing where calls are concentrated geographically, similar to the reference screenshot. The map will use state data extracted from call results.

### Data Source
The `calls.extracted_data` jsonb field contains a `state` field (collected as part of the agent's `must_collect_fields`). We'll aggregate calls by state to generate the distribution data.

### Implementation

**1. New component: `src/components/USMapChart.tsx`**
- An SVG-based US state map component with all 50 states as simplified path outlines
- Each state gets a fill color based on call count (gradient from light gray to primary/green)
- States with calls show a colored dot/bubble proportional to call volume
- Tooltip on hover showing state name and call count
- Responsive container, dark-theme compatible
- Uses state abbreviation codes (FL, NY, TX, etc.) to match extracted_data

**2. Update `src/pages/CallsPage.tsx`**
- Restructure the layout: when no call is selected, show a full-width view with the map at the top and the call list below
- Parse `extracted_data.state` from each call to build a `Record<string, number>` of state counts
- Pass the aggregated data to the `USMapChart` component
- Add "Call Distribution by Region" heading above the map

### Layout Changes
Currently the Calls page is a side-by-side list + detail view. The new layout:
- **No call selected**: Map section at top, call list below (full width)
- **Call selected**: Map hidden, existing side-by-side layout (list left, detail right)

### Technical Details

**State aggregation logic:**
```typescript
const stateDistribution = useMemo(() => {
  const counts: Record<string, number> = {};
  calls.forEach(call => {
    const state = call.extracted_data?.state;
    if (state && typeof state === 'string') {
      const abbr = state.toUpperCase().trim();
      counts[abbr] = (counts[abbr] || 0) + 1;
    }
  });
  return counts;
}, [calls]);
```

**USMapChart component:**
- Uses inline SVG with simplified US state boundaries (standard approach for lightweight maps)
- Color scale: states with 0 calls get `fill: #e5e7eb` (light gray), states with calls get progressively deeper shades of the primary color
- State labels (2-letter abbreviations) positioned at state centers
- Dots/circles at state centers sized by call count
- No external mapping library needed -- pure SVG + React

**Files to create/edit:**
- Create: `src/components/USMapChart.tsx`
- Edit: `src/pages/CallsPage.tsx`

