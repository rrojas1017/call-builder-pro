

## Inbound Calls Integration with Bland AI

### Overview
Add full inbound call handling: purchasing phone numbers, assigning them to agents, receiving inbound calls via webhook, and tracking performance -- all using the Bland AI Numbers API.

---

### Database Changes

**New table: `inbound_numbers`**
Tracks purchased or uploaded phone numbers and their agent assignments.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK -> organizations | |
| phone_number | text UNIQUE | E.164 format, e.g. +14155551234 |
| project_id | uuid FK -> agent_projects NULL | Assigned agent (nullable = unassigned) |
| label | text NULL | User-friendly label, e.g. "Main Support Line" |
| area_code | text NULL | Original area code requested |
| status | text DEFAULT 'active' | active, inactive, released |
| monthly_cost_usd | numeric DEFAULT 15 | Bland charges $15/mo |
| purchased_at | timestamptz DEFAULT now() | |
| created_at | timestamptz DEFAULT now() | |

RLS: org-based access via profiles join.

**Modify `calls` table:**
- Add nullable column `inbound_number_id` (uuid FK -> inbound_numbers) to link inbound calls to specific numbers for tracking.

---

### Edge Functions

**1. `manage-inbound-numbers` (new)**
Handles all number management operations via a single function with an `action` parameter:

- **`purchase`**: Calls `POST https://api.bland.ai/numbers/purchase` with `area_code`. Inserts the new number into `inbound_numbers`. Then calls `POST https://api.bland.ai/v1/inbound/{phone_number}` to configure the prompt/voice/webhook.
- **`list_bland`**: Calls `GET https://api.bland.ai/v1/inbound` to sync/list numbers from Bland.
- **`assign`**: Updates `inbound_numbers.project_id`, then calls `POST https://api.bland.ai/v1/inbound/{phone_number}` to update the agent prompt, voice, webhook URL, and metadata on Bland's side.
- **`unassign`**: Sets `project_id` to null, updates Bland with a generic "This number is not currently in service" prompt.
- **`release`**: Marks the number as `released` in the database (Bland handles actual release via their dashboard/billing).
- **`sync`**: Fetches all numbers from Bland API, upserts into `inbound_numbers` to keep local state in sync.

When assigning, the function will:
1. Fetch the agent's spec (prompt, voice, transfer rules, etc.)
2. Build the task prompt using the same `buildTaskPrompt` logic from `tick-campaign`
3. Configure the Bland inbound number with: prompt, voice_id, webhook URL, transfer_phone_number, background_track, and metadata (org_id, project_id)

**2. Update `receive-bland-webhook`**
Add inbound call detection logic:
- When a webhook arrives without campaign metadata but WITH a `to` number matching an `inbound_numbers` entry, treat it as an inbound call.
- Look up `inbound_numbers` by the called number to get `project_id` and `org_id`.
- Insert into `calls` with `direction: "inbound"` and `inbound_number_id`.
- Trigger `evaluate-call` for completed inbound calls (same evaluation pipeline as outbound).

---

### Frontend Pages

**1. New page: `InboundNumbersPage` (`/inbound`)**
Number management dashboard with:
- **Header**: "Inbound Numbers" with a "Buy Number" button
- **Buy Number dialog**: Area code input, purchase confirmation with $15/mo cost note
- **Numbers table/grid**: Phone number, label, assigned agent, status, call count, purchase date
- **Assign agent**: Dropdown selector per number to pick from existing agents
- **Sync button**: Pull latest from Bland to reconcile

**2. Update `CallsPage`**
- Add a direction filter tab (All / Outbound / Inbound)
- Show inbound number info when viewing inbound call details
- Display caller's phone number for inbound calls

**3. Update `DashboardPage`**
- Already tracks inbound vs outbound in volume chart and KPIs -- will work automatically once inbound calls flow through
- Add an "Inbound Numbers" count to KPI row if any exist

**4. Update `AppSidebar`**
- Add "Inbound" nav item with PhoneIncoming icon between "Campaigns" and "Calls"

**5. Update `App.tsx`**
- Add route `/inbound` pointing to `InboundNumbersPage`

---

### User Journey

```text
1. User navigates to /inbound
2. Clicks "Buy Number" -> enters area code -> confirms purchase
3. Number appears in the list as "unassigned"
4. User selects an agent from dropdown -> number is configured on Bland
5. When someone calls that number, Bland handles the call with the assigned agent's prompt
6. Webhook fires -> receive-bland-webhook processes it as inbound
7. Call appears in /calls with direction "inbound"
8. Dashboard and agent leaderboard automatically reflect inbound performance
```

---

### Technical Details

**Bland API Endpoints Used:**
- `POST https://api.bland.ai/numbers/purchase` -- buy a number ($15/mo)
- `POST https://api.bland.ai/v1/inbound/{phone_number}` -- configure/update inbound agent settings (prompt, voice, webhook, transfer, metadata)
- `GET https://api.bland.ai/v1/inbound` -- list all configured inbound numbers
- `GET https://api.bland.ai/v1/inbound/{phone_number}` -- get single number details

**Webhook Configuration:**
When assigning an agent to a number, the webhook URL is set to the existing `receive-bland-webhook` function URL. Metadata includes `org_id` and `project_id` so the webhook can route correctly.

**Config updates:**
- Add `[functions.manage-inbound-numbers]` with `verify_jwt = false` to `supabase/config.toml`

**Files Created:**
- `supabase/functions/manage-inbound-numbers/index.ts`
- `src/pages/InboundNumbersPage.tsx`

**Files Modified:**
- `supabase/functions/receive-bland-webhook/index.ts` -- add inbound call detection
- `src/App.tsx` -- add route
- `src/components/AppSidebar.tsx` -- add nav item
- `src/pages/CallsPage.tsx` -- add direction filter
- Database migration for `inbound_numbers` table and `calls.inbound_number_id` column

