

# Campaign Detail Page: Modern Dashboard Redesign

## Problem
The current Campaign Detail page uses a flat, basic layout with plain KPI cards in a cramped row, a simple pie chart, and uniform card styling throughout. It looks like a spreadsheet rather than a modern analytics dashboard.

## Design Direction
Modernize the dashboard with visual hierarchy, gradient accents, better spacing, improved chart presentation, and the existing utility classes (`glass-card`, `gradient-border`, `glow-primary`, `text-gradient-primary`) already defined in the CSS but unused on this page.

## What Changes

### 1. Header Section Overhaul
- Larger campaign name with gradient text for the status badge
- Campaign metadata (agent, date, concurrency) displayed as subtle chips instead of raw text
- Action buttons grouped in a pill-shaped container with better visual weight
- HIPAA and TEST badges with icon+color styling

### 2. Progress Bar Enhancement
- Taller progress bar with gradient fill (orange-to-amber)
- Percentage shown as a large bold number beside the bar
- Animated shimmer effect when campaign is running

### 3. KPI Cards Redesign
- Reduce from 9 cramped cards to 4 primary hero KPIs (Total Contacts, Qualified, Conversion Rate, Avg Score) displayed prominently with larger numbers and subtle icon backgrounds
- Secondary metrics (In Progress, Terminal, Retryable, Failed, Avg Duration) shown as a compact inline row below
- Use `gradient-border` class on the primary KPIs for visual pop
- Color-coded values: green for qualified/conversion, orange for in-progress, red for failed

### 4. Charts Section Upgrade
- Replace basic Recharts PieChart with a donut chart (inner radius) and center label showing total
- Add subtle gradient backgrounds to chart cards
- Use the project's `ChartContainer` and `ChartTooltipContent` from `src/components/ui/chart.tsx` for consistent themed tooltips
- Performance by List table gets alternating row backgrounds and progress bars for completion rate instead of plain percentages

### 5. Live Calls Section
- More prominent pulsing indicator with a frosted glass card (`glass-card` class)
- Each live call row gets a subtle green left border accent
- Better phone number formatting and elapsed time display

### 6. Contacts Table
- Sticky header with subtle blur background
- Row hover with left-border accent color based on outcome
- Status badges use filled pill style instead of outline
- Better spacing and typography hierarchy

### 7. Contact Detail Drawer
- Evaluation scores displayed as circular progress rings instead of plain numbers
- Better visual grouping with section dividers
- Recording link styled as a prominent audio player-like button

## Technical Details

### Files to modify
- `src/pages/CampaignDetailPage.tsx` -- full visual overhaul of the render section (logic stays the same)

### Approach
- All existing logic, state management, data fetching, and realtime subscriptions remain untouched
- Only the JSX return block and some styling constants change
- Leverage existing Tailwind utilities and CSS custom classes already defined in `index.css`
- No new dependencies needed

### Key styling patterns to apply
- `glass-card` on the Live Calls section
- `gradient-border` on hero KPI cards
- `text-gradient-primary` on key metric values
- `hover-lift` on interactive cards
- `mesh-gradient` as subtle background on the header area
- Donut chart with `innerRadius={60}` and center text label
- Progress bars inside the list performance table for visual rate display
- Consistent use of `rounded-xl` instead of `rounded-lg` for a softer, modern feel

