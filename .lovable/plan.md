

# List Detail View with Campaign Performance Stats

## Overview
When a user clicks on a list, open a detail panel/dialog showing comprehensive stats about that list's performance across all campaigns it has been used in: total contacts, contacted, connected, DNC, available to dial, penetration rate, conversion rate, and which campaigns used the list.

## What Changes

### 1. Clickable List Cards
- Each list card in the list view becomes clickable
- Clicking opens a detail dialog/sheet with full stats
- Delete button remains separate (does not trigger detail view)

### 2. List Detail Dialog
When opened, queries:
- `contacts` table filtered by `list_id` to get all contact records across all campaigns
- `campaign_lists` joined with `campaigns` to show which campaigns used this list
- `calls` joined via contacts to get outcome data

**KPI Cards displayed:**
- **Total Contacts** -- `row_count` from the list
- **Contacted** -- contacts with status != "queued" (have been attempted)
- **Connected** -- contacts with status = "completed" (call actually happened)
- **Available to Dial** -- contacts with status = "queued" and attempts < max
- **DNC** -- contacts with outcome containing "dnc" or "do_not_call"
- **Penetration Rate** -- (Contacted / Total) as percentage
- **Conversion Rate** -- (Qualified or successful outcome / Contacted) as percentage

**Campaigns Section:**
- List of campaigns that use this list (via `campaign_lists` join)
- Each shows campaign name, status, and contact count from this list in that campaign

**Contact Preview Table:**
- Scrollable table showing contacts from this list with their status, outcome, attempts, and last called date
- Paginated or limited to first 100 rows

### 3. Progress Indicators on List Cards
- Add a mini progress bar to each list card showing penetration rate (contacted/total)
- Show key stats inline: "245/500 contacted -- 48% penetration"

## Technical Details

### Data Fetching (on dialog open)
```text
-- Get contacts for this list across all campaigns
SELECT * FROM contacts WHERE list_id = <list_id>;

-- Get campaigns using this list
SELECT c.* FROM campaigns c 
JOIN campaign_lists cl ON cl.campaign_id = c.id 
WHERE cl.list_id = <list_id>;
```

### Stat Computation (frontend)
```text
const total = contacts.length;
const contacted = contacts.filter(c => c.status !== 'queued').length;
const completed = contacts.filter(c => c.status === 'completed').length;
const queued = contacts.filter(c => c.status === 'queued').length;
const dnc = contacts.filter(c => c.status === 'completed' && c.last_error?.includes('dnc')).length;
// Use outcome from calls table for more accurate DNC/qualified counts
const penetration = total > 0 ? (contacted / total * 100) : 0;
```

### Files to modify
- `src/pages/ListsPage.tsx` -- add detail dialog, clickable cards, progress indicators, and stat computation

### No database changes needed
- All required data already exists in `contacts`, `campaign_lists`, and `campaigns` tables
- `contacts.list_id` provides the link from contacts back to their source list
