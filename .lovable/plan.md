

## Make the US Map Interactive and Data-Rich

### The Problem Today

The US map currently pulls state data from `extracted_data.state`, but this field contains messy AI-extracted text like "Unknown", "Not specified", or full sentences ("zip code 32765 suggests Florida"). As a result, the map shows almost nothing useful.

### The Fix: Two-Part Approach

#### Part 1: Reliable State Data from Phone Numbers

Instead of relying on AI-extracted state values, derive state from the contact's **phone number area code**. Area codes map reliably to US states. This means every outbound call with a phone number gets plotted on the map automatically -- no AI extraction needed.

**New utility file: `src/lib/areaCodeToState.ts`**
- A lookup map of ~300 US area codes to state abbreviations (e.g., `212 -> NY`, `310 -> CA`, `786 -> FL`)
- A helper function `phoneToState(phone: string): string | null` that extracts the area code and returns the state

**Database**: Add `to_number` column to the `calls` table so we store the dialed number (currently only in `contacts`). Alternatively, join through `contact_id` to get the phone number.

#### Part 2: Interactive Map with Drill-Down and Metrics

Transform the static map into a rich, clickable analytics view.

**Enhanced `USMapChart` component** -- new props and features:

| Feature | Description |
|---------|-------------|
| **Metric selector** | Toggle between: Call Volume, Conversion Rate, Avg Score, Avg Duration |
| **Color by metric** | Heat map colors change based on selected metric (green gradient for conversion, blue for volume, etc.) |
| **Click to filter** | Clicking a state filters the call list below to only show calls from that state |
| **State detail panel** | Hovering shows a rich tooltip: call count, conversion rate, top outcome, avg score |
| **Legend** | Color scale legend showing what the gradient means |
| **Active state highlight** | Selected state gets a border highlight and a "Clear filter" option |

**Changes to `CallsPage.tsx`:**

1. Add `selectedState` state variable
2. Pass an `onStateClick` callback to `USMapChart`
3. Filter the call list when a state is selected
4. Show a "Showing calls from [State]" banner with a clear button
5. Derive per-state metrics (conversion rate, avg score, avg duration) and pass as enriched data to the map

**Updated `USMapChart` props:**
```
interface USMapChartProps {
  stateData: Record<string, {
    calls: number;
    conversionRate: number;
    avgScore: number | null;
    avgDuration: number;
  }>;
  metric: "calls" | "conversion" | "score" | "duration";
  onMetricChange: (m: string) => void;
  selectedState: string | null;
  onStateClick: (abbr: string | null) => void;
}
```

**Color logic by metric:**
- **Call Volume**: Teal gradient (current style, but richer)
- **Conversion Rate**: Green gradient (0% = gray, 100% = bright green)
- **Avg Score**: Blue-to-purple gradient
- **Avg Duration**: Amber gradient

### Technical Summary

| Change | File | What |
|--------|------|------|
| Area code map | New `src/lib/areaCodeToState.ts` | ~300 area code to state mappings |
| DB migration | SQL | Query contacts table for phone numbers via `contact_id` join |
| Map component | `src/components/USMapChart.tsx` | Multi-metric support, click handler, enriched tooltips, legend |
| Calls page | `src/pages/CallsPage.tsx` | State click filtering, metric selector, per-state metric derivation, phone-to-state resolution |

### What This Unlocks

- **See where your calls convert best** -- click "Conversion Rate" and instantly spot which states perform well
- **Drill into a state** -- click Texas, and the call list filters to only TX calls
- **Compare performance geographically** -- toggle between score, duration, and volume to understand regional patterns
- **Works automatically** -- no need for AI to extract state data; area codes handle it reliably

