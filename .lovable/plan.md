

# Redesign Inbound Numbers Page

## Overview
Revamp the `/inbound` page to match the style of other sections (Calls, Campaigns) with stats cards at the top, a cleaner title ("Phone Numbers" instead of "Inbound Numbers" inside the page), and clickable number rows that open a detail panel/dialog.

## Changes

### 1. Stats Cards at the Top
Add a row of 4 stat cards (same `StatCard` pattern used on the Calls page):
- **Total Numbers** -- count of active numbers
- **Assigned** -- how many have a project_id linked
- **Unassigned** -- numbers without an agent
- **Total Inbound Calls** -- sum of call counts across all numbers

### 2. Rename Section Title
- Page heading stays "Inbound Numbers" (matches sidebar nav)
- Subtitle changes to: "Purchase and manage your phone numbers"
- The empty state and internal references say "phone numbers" instead of "inbound numbers"

### 3. Clickable Number Rows with Detail Dialog
When a user clicks on a number row, a dialog opens showing:
- Phone number and label (editable)
- Assigned agent name (with link to agent page)
- Status and area code
- Monthly cost
- Purchase date
- Total inbound calls for that number
- Recent calls list (last 5 calls to that number from the `calls` table filtered by `inbound_number_id`)

### 4. Assignment Visibility
Each number row already shows the agent dropdown. The detail dialog will make the assignment more prominent, showing the agent name with a badge for assigned/unassigned status.

## Technical Details

### File Modified: `src/pages/InboundNumbersPage.tsx`

**Stats section** (new, inserted before the numbers list):
- Compute stats from the existing `numbers` and `callCounts` state
- Render 4 `StatCard`-style divs matching the Calls page pattern

**Detail dialog** (new):
- New state: `selectedNumber` for the currently clicked number
- On click, open a `Dialog` showing number details
- Fetch recent calls: query `calls` table where `inbound_number_id = selectedNumber.id`, limit 5, ordered by `created_at desc`
- Show each recent call with outcome badge, duration, and timestamp
- Allow inline label editing via the existing `update_label` action on `manage-inbound-numbers`

**Row click handler**:
- Make the number row clickable (add `cursor-pointer` and `onClick`)
- Keep the assign dropdown and delete button functional without triggering the detail dialog (stop propagation)

No database changes or new edge functions needed -- all data is already available.
