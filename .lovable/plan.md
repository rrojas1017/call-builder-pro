
# Agent Name Visibility + Card/List View Toggle

## Problem
Agent names get truncated in the current card layout because the name shares a row with multiple badges (Outbound, Append, Training). There's also no way to switch to a more compact list view.

## Changes to `src/pages/AgentsPage.tsx`

### 1. Add view toggle state
- Add `viewMode` state: `"card" | "list"` (default `"card"`)
- Import `LayoutGrid` and `List` icons from lucide-react for the toggle buttons
- Import `ToggleGroup` and `ToggleGroupItem` from the existing UI components

### 2. Add toggle buttons in the header
- Place a `ToggleGroup` next to the "New Agent" button with two options: grid icon (card) and list icon (list)

### 3. Fix name visibility in Card View
- Move badges below the agent name instead of inline, so the name gets the full row width and never truncates
- Layout becomes:
  - Row 1: Mode icon + Agent name (full width, no truncation)
  - Row 2: Badges (Outbound, Append, Training) + date
  - Row 3: Description (if any)
  - Row 4: Action links (Edit, Test, Knowledge, Delete)

### 4. Add List View
- Render agents in a table-style layout when `viewMode === "list"`
- Columns: Mode icon | Name (full text) | Badges | Date | Actions
- Each row is clickable, linking to the same campaign route
- Uses the existing `Table` components for consistency

### Technical Summary
- Only `src/pages/AgentsPage.tsx` is modified
- No new dependencies or database changes
- Uses existing `ToggleGroup` and `Table` UI components
