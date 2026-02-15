

## Add Mock/Demo Data to the US Map

### What
Inject realistic mock state data into the map so you can see how it looks with real geographic distribution across all four metrics, while keeping the real data pipeline intact.

### How

**File: `src/pages/CallsPage.tsx`** (lines ~288-310, the `stateMetrics` useMemo)

After computing real `stateMetrics` from actual call data, merge in demo data for any states that don't already have real data. The mock covers ~15-20 states with varied values across all metrics (calls, conversion rate, score, duration) to showcase the heat map gradients and tooltips.

A flag `useMockData` (defaulting to `true`) wraps this logic. When real campaign data grows, flip it to `false` (or remove it). The mock data will look something like:

```
const DEMO_STATE_DATA: Record<string, StateMetrics> = {
  CA: { calls: 47, conversionRate: 34, avgScore: 78, avgDuration: 185 },
  TX: { calls: 38, conversionRate: 42, avgScore: 82, avgDuration: 210 },
  NY: { calls: 31, conversionRate: 28, avgScore: 71, avgDuration: 155 },
  FL: { calls: 29, conversionRate: 51, avgScore: 85, avgDuration: 240 },
  IL: { calls: 18, conversionRate: 22, avgScore: 65, avgDuration: 120 },
  PA: { calls: 15, conversionRate: 38, avgScore: 74, avgDuration: 175 },
  OH: { calls: 14, conversionRate: 31, avgScore: 69, avgDuration: 140 },
  GA: { calls: 12, conversionRate: 45, avgScore: 80, avgDuration: 195 },
  NC: { calls: 11, conversionRate: 36, avgScore: 76, avgDuration: 160 },
  MI: { calls: 10, conversionRate: 19, avgScore: 58, avgDuration: 95 },
  NJ: { calls: 9, conversionRate: 55, avgScore: 88, avgDuration: 260 },
  VA: { calls: 8, conversionRate: 40, avgScore: 73, avgDuration: 150 },
  WA: { calls: 7, conversionRate: 48, avgScore: 81, avgDuration: 200 },
  AZ: { calls: 6, conversionRate: 33, avgScore: 70, avgDuration: 130 },
  CO: { calls: 5, conversionRate: 60, avgScore: 91, avgDuration: 280 },
  MN: { calls: 4, conversionRate: 25, avgScore: 62, avgDuration: 110 },
  MO: { calls: 3, conversionRate: 67, avgScore: 84, avgDuration: 220 },
  TN: { calls: 3, conversionRate: 33, avgScore: 72, avgDuration: 145 },
};
```

Merge logic: real data takes priority -- mock only fills in states with no real calls.

A small "Demo data" badge will appear near the map header so it's clear this is sample visualization. Clicking states with mock data won't filter the call list (since there are no matching calls).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/CallsPage.tsx` | Add `DEMO_STATE_DATA` constant and merge logic in `stateMetrics` memo, add "Demo data" indicator badge |

### Removal Later

When enough real campaign calls exist (say 50+ with contacts), simply delete the `DEMO_STATE_DATA` block and the merge logic. One constant and ~5 lines of merge code to remove.
