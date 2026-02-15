

## Redesign Agent Profile Card: Compact Bar + Click-to-Expand

### Current problem
The profile card dumps all details inline -- maturity badge, voice, mode, description, and a 6-column stats grid. For mature agents with lots of data, it's too tall and cluttered for a form context.

### New design

The card becomes two compact rows:

```text
+------------------------------------------------------------+
| [Training ====>                          ] Developing  40%  |
+------------------------------------------------------------+
|  54         6        45.9/100    323       v37       36     |
|  Total    Qualified  Avg Score  Knowledge  Version  Improv. |
+------------------------------------------------------------+
```

**Row 1 -- Maturity Bar**: A slim, color-coded progress bar showing the agent's maturity level. The bar fill and color change per level (gray for Training, blue for Developing, amber for Competent, green for Expert, purple for Graduated). The level label and percentage sit to the right.

**Row 2 -- Stats Row**: The same 6 stats (Total Calls, Qualified, Avg Score, Knowledge, Version, Improvements) displayed in a single compact row with small icons above each value -- matching the reference image style exactly.

**Click to expand**: Clicking anywhere on the card (or the bar specifically) opens a Popover showing the full details:
- Description text
- Voice name and mode
- All stats with more context
- Maturity level explanation

### Maturity bar mapping

| Level | Progress % | Bar Color |
|---|---|---|
| training | 10% | Gray (muted) |
| developing | 30% | Blue |
| competent | 55% | Amber |
| expert | 80% | Emerald |
| graduated | 100% | Purple |

### Technical details

**File: `src/components/AgentProfileCard.tsx`** -- Full redesign

1. Keep all existing data fetching logic (useEffect, queries) unchanged
2. Replace the render with:
   - A clickable container with `cursor-pointer`
   - A slim progress bar (6px height, rounded, with colored fill based on maturity level)
   - Maturity label + percentage to the right of the bar
   - Stats row below with icons, values, and labels in a horizontal grid
3. Add a `Popover` (using existing Radix popover) that opens on click, showing:
   - Description
   - Voice + Mode badges
   - Full stats with larger formatting
   - Maturity level with explanation text
4. Simplify the loading skeleton to match the new compact height (one thin bar + one row)

No new files needed. No database changes. Only `AgentProfileCard.tsx` is modified.
