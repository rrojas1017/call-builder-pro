

# Improve the University Page

## Current State
The University page has a functional but basic layout: a test call form, a humanness trend chart, and a call history table. After reviewing it, here are the key issues:

1. **No graduation status visible** — The page talks about "graduating" agents but never shows the current graduation level (Training, Practicing, Proficient, Advanced, Graduated). Users have no idea where their agent stands.

2. **Chart X-axis is broken** — All dates show as "Feb 12" repeated because the date formatting doesn't distinguish between data points properly.

3. **Phone number re-entry friction** — Users have to type their phone number every time. It should remember the last-used number.

4. **No call duration in history** — The history table shows date, outcome, and scores but not how long the call lasted, which is important context.

5. **Single narrow column wastes space** — The page is capped at `max-w-2xl` (672px) with a lot of wasted horizontal space on desktop.

6. **No summary stats** — No quick at-a-glance metrics like "average humanness over last 10 calls" or "total test calls run."

## Plan

### 1. Add Graduation Level Badge
Show a prominent badge at the top of the page displaying the agent's current graduation level based on their rolling average humanness score. Levels: Training (<60), Practicing (60-69), Proficient (70-79), Advanced (80-89), Graduated (90+). Calculate from the last 10 evaluated calls. Include a progress bar showing distance to the next level.

### 2. Fix Chart Date Labels
Change the date formatting to include time (`"MMM d, h:mm a"`) so each point is unique, or use sequential index labels like "Call 1, Call 2..." to avoid duplicate axis labels.

### 3. Remember Last Phone Number
Store the last-used phone number in `localStorage` and pre-fill the input on load.

### 4. Widen Layout + Add Summary Stats Row
Change from `max-w-2xl` to `max-w-4xl`. Add a row of 3-4 stat cards above the chart: Total Test Calls, Avg Humanness (last 10), Current Level, Best Score.

### 5. Add Duration Column to History Table
Add a "Duration" column showing the call length in `m:ss` format.

### 6. Quick Re-test Button
After viewing a historical result, show a "Re-test Now" button that pre-fills the phone and immediately starts a new test call — one click to re-run.

### Files Changed
- **`src/pages/UniversityPage.tsx`** — All changes above (graduation badge, chart fix, layout widening, stats row, duration column, localStorage phone, re-test button)

No database or backend changes needed — graduation level is calculated client-side from existing evaluation data.

