

## Lists, Campaigns, and Results Dashboard

### Overview
Build a complete workflow: upload contact lists with automatic field detection, attach lists to campaigns, assign an agent, and view campaign results broken down by list and agent performance.

### Data Model Changes

**New table: `dial_lists`**
- `id` (uuid, PK)
- `org_id` (uuid, FK to organizations)
- `name` (text) -- user-given name for the list
- `file_name` (text) -- original uploaded file name
- `row_count` (integer)
- `detected_fields` (jsonb) -- array of detected column names, e.g. `["name","phone","state","age"]`
- `status` (text, default "ready") -- ready, archived
- `created_at` (timestamptz)

**New table: `campaign_lists`** (junction -- a campaign can have many lists)
- `id` (uuid, PK)
- `campaign_id` (uuid, FK to campaigns)
- `list_id` (uuid, FK to dial_lists)
- `created_at` (timestamptz)

**Modify `contacts` table**
- Add `list_id` (uuid, nullable) -- tracks which list a contact came from
- Add `extra_data` (jsonb, nullable) -- stores any additional fields beyond name/phone (e.g. state, age, income)

**Modify `campaigns` table**
- Add `agent_project_id` column (uuid, nullable) -- the agent assigned to this campaign (currently `project_id` serves this purpose but naming is ambiguous)

**RLS policies** for new tables follow the existing org-isolation pattern using `get_user_org_id()`.

### User Journey

```text
+------------------+     +-------------------+     +------------------+     +------------------+
|  1. Upload List  | --> |  2. Preview &     | --> | 3. Create        | --> | 4. Campaign      |
|  (CSV file)      |     |  Confirm Fields   |     |  Campaign +      |     |  Results         |
|                  |     |                   |     |  Assign Agent    |     |  Dashboard       |
+------------------+     +-------------------+     +------------------+     +------------------+
```

**Step 1 -- Upload**: User drops or selects a CSV file on the Lists page. The system reads the header row and auto-detects field names.

**Step 2 -- Preview**: Shows detected columns (name, phone, state, age, etc.), a preview of the first 5 rows, total row count, and which column maps to "phone" (required) and "name". User confirms or remaps before saving.

**Step 3 -- Campaign Creation**: On the Campaigns page, user creates a campaign by: naming it, selecting one or more uploaded lists, and choosing which agent to use. Contacts from the selected lists are copied into the `contacts` table linked to the campaign and list.

**Step 4 -- Results Dashboard**: New campaign detail page (`/campaigns/:id`) showing:
- Overall stats (total contacts, called, outcomes)
- Breakdown by list (which list performed better)
- Agent success metrics (completion rate, average duration, outcome distribution)
- Table of individual contacts with status and outcome

### New Pages and Routes

| Route | Page | Purpose |
|---|---|---|
| `/lists` | `ListsPage.tsx` | View all uploaded lists, upload new ones |
| `/campaigns/:id` | `CampaignDetailPage.tsx` | Campaign results dashboard |

### Updated Sidebar
Add "Lists" nav item (with `FileSpreadsheet` icon) between "Gym" and "Campaigns".

### Edge Function Updates

**Update `parse-dial-list`**
- Auto-detect header row and identify all columns
- Identify which column is likely "phone" (contains phone-like data) and "name"
- Return `{ detected_fields: string[], phone_column: string, name_column: string, rows: object[], count: number }`
- Support flexible CSV formats (quoted fields, varying column counts)

### Files to Create
- `src/pages/ListsPage.tsx` -- upload, preview, confirm, list management
- `src/pages/CampaignDetailPage.tsx` -- campaign results dashboard with list breakdown

### Files to Modify
- `src/App.tsx` -- add routes for `/lists` and `/campaigns/:id`
- `src/components/AppSidebar.tsx` -- add "Lists" nav item
- `src/pages/CampaignsPage.tsx` -- rework creation flow to select lists + agent instead of inline CSV upload
- `supabase/functions/parse-dial-list/index.ts` -- smart field detection from CSV headers
- Database migration -- new tables, altered columns, RLS policies

### Technical Details

**Smart field detection logic** (in `parse-dial-list`):
1. Read first line as header
2. Scan header names for phone-like columns (`phone`, `phone_number`, `mobile`, `cell`, `telephone`)
3. Scan for name-like columns (`name`, `full_name`, `first_name`, `contact`)
4. If no header detected (all rows look like data), fall back to positional: column 0 = name, column 1 = phone
5. Return all columns as `detected_fields` so the UI can show them

**Campaign creation flow**:
1. Select agent (from `agent_projects`)
2. Name the campaign
3. Pick one or more lists (checkboxes showing list name, row count, upload date)
4. On create: insert campaign row, insert `campaign_lists` junction rows, copy contacts from `dial_list_rows` into `contacts` with `list_id` and `campaign_id` set

**Results dashboard cards**:
- Total contacts / called / completed / failed
- Pie chart of outcomes
- Table grouped by list showing per-list completion rate
- Filterable contact table with status, outcome, duration

