

# Redesign Phone Numbers Page -- List-Detail Layout

## Overview
Redesign the Phone Numbers page to use a split-panel layout similar to Retell's dashboard: a compact phone number list on the left, and a detailed configuration panel on the right when a number is selected.

## Layout

```text
+-------------------+--------------------------------------+
| Phone Numbers [+] |  +1(948)265-0259                     |
|                   |                                      |
| [Search...]       |  Inbound Call Agent                  |
|                   |  [ACA Inbound Qualifier v]           |
| +1(948)265-0259   |                                      |
| +1(415)964-3349   |  Label                               |
| +1(786)686-3423   |  [ACA Inbound            ] [Save]   |
| +1(786)699-7885   |                                      |
|                   |  Details                             |
|                   |  Area Code: 948                      |
|                   |  Cost: $2/mo                         |
|                   |  Purchased: Jan 15, 2025             |
|                   |  Calls: 8                            |
|                   |                                      |
|                   |  Recent Calls                        |
|                   |  [call entries...]                   |
|                   |                                      |
|                   |  [Release Number]                    |
+-------------------+--------------------------------------+
```

## Changes

### Remove the current layout
- Remove the stats cards row at the top (the detail panel provides this info per-number)
- Remove the inline Select dropdowns and Badge from each row
- Remove the `PhoneNumberDetailDialog` -- replaced by the inline detail panel

### Left Panel -- Number List
- Header: "Phone Numbers" title with a "+" button to open the Buy Number dialog
- Search input to filter numbers by phone number or label
- Compact list of numbers showing just the phone number and a subtle indicator if assigned (green dot) or unassigned (gray dot)
- Clicking a number selects it and highlights the row
- Sync button moved to bottom or as a subtle icon in the header

### Right Panel -- Number Detail (shown when a number is selected)
- Phone number as the heading (formatted like Retell: +1(948)265-0259)
- **Inbound Call Agent** section: Select dropdown to assign/unassign an agent
- **Label** section: Editable text field with save button
- **Details** grid: Area code, monthly cost, purchase date, total calls
- **Recent Calls** section: Last 5 calls with outcome, duration, timestamp
- **Release Number** button at the bottom (destructive action with confirmation)
- Empty state when no number is selected: "Select a phone number to view details"

### Files Modified

| File | Change |
|------|--------|
| `src/pages/InboundNumbersPage.tsx` | Complete rewrite to list-detail split layout with search, selection state, and inline detail panel |
| `src/components/PhoneNumberDetailDialog.tsx` | Delete -- functionality moved inline into the detail panel |

### Technical Notes
- Use CSS grid or flexbox for the two-panel layout (`grid-cols-[320px_1fr]`)
- Keep all existing data fetching logic (numbers, agents, callCounts, orgId)
- Move the recent calls fetch from the dialog into the page, triggered when `selectedNumber` changes
- Reuse existing handlers: `handleAssign`, `handleRelease`, `handlePurchase`, `handleSync`
- Format phone numbers for display: `+19482650259` becomes `+1(948)265-0259`
- The left panel should have a fixed height with scroll for the number list
- On mobile, show only the list; tapping a number navigates to the detail view (or stacks vertically)

