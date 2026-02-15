

## Auto-Redial for Non-Connected Contacts

### Problem

Today the system treats "completed" too broadly -- voicemails, no-answers, busy tones all count as terminal statuses. Once a contact gets any of these dispositions, it stays there forever. There's also no way to tell the system "retry voicemails up to 3 times" when creating a campaign.

### What this changes

**1. Redefine "completed" to mean only final outcomes**

Only these statuses are truly terminal (no more dials):
- `completed` -- a real conversation happened (successful outcome)
- `dnc` -- Do Not Call request
- `disconnected` -- disconnected/invalid number
- `failed` -- system error (already terminal)
- `cancelled` -- manually stopped

Everything else is retryable: `voicemail`, `no_answer`, `busy`, `call_me_later`, `not_available`.

**2. Add redial settings to campaigns table**

New columns on the `campaigns` table:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `max_attempts` | integer | 1 | How many total dial attempts per contact (1 = no redial) |
| `redial_delay_minutes` | integer | 60 | Wait time between attempts |
| `redial_statuses` | text[] | `{voicemail,no_answer,busy}` | Which dispositions trigger a redial |

**3. Add `call_me_later` and `not_available` as recognized statuses**

- Webhooks (Bland + Retell) will map new provider-specific signals to `call_me_later`, `not_available`, and `dnc`
- The UI will display badges for all new statuses

**4. Auto-redial logic in tick-campaign**

When `tick-campaign` runs and finds no `queued` contacts, before marking the campaign as completed it will:
1. Look for contacts whose status is in `campaign.redial_statuses`, whose `attempts < campaign.max_attempts`, and whose `called_at` is older than `redial_delay_minutes` ago
2. Reset those contacts to `queued` so they get picked up on the next tick
3. Only mark the campaign `completed` when there are zero queued AND zero retryable contacts

**5. Campaign creation form gets redial settings**

The "New Campaign" form will include:
- Max Attempts (number input, 1-10, default 3)
- Redial Delay (minutes input, default 60)
- Retryable Statuses (checkboxes for voicemail, no answer, busy, call me later, not available)

### Technical detail

**Database migration:**

```sql
ALTER TABLE campaigns
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN redial_delay_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN redial_statuses text[] NOT NULL DEFAULT '{voicemail,no_answer,busy}';
```

**File: `supabase/functions/receive-bland-webhook/index.ts`**
- Add mapping for `dnc` / `do_not_call` -> status `dnc`
- Add mapping for `not_available` -> status `not_available`
- Add mapping for `call_me_later` / `callback` -> status `call_me_later`
- Add mapping for `disconnected` -> status `disconnected`
- Increment `attempts` counter on the contact when updating status

**File: `supabase/functions/receive-retell-webhook/index.ts`**
- Same status mapping additions as Bland webhook

**File: `supabase/functions/tick-campaign/index.ts`**
- After the "no queued contacts" check (line 78), add a redial pass:
  - Query contacts where `status IN (campaign.redial_statuses)` AND `attempts < campaign.max_attempts` AND `called_at < now() - redial_delay_minutes`
  - Update matching contacts to `status = 'queued'`
  - If any were re-queued, continue the tick (don't mark campaign completed)
  - Only mark `completed` when zero queued + zero retryable remain

**File: `src/pages/CampaignsPage.tsx`**
- Add Max Attempts input (number, 1-10, default 3)
- Add Redial Delay input (minutes, default 60)
- Add Retryable Statuses checkboxes (voicemail, no_answer, busy, call_me_later, not_available)
- Include these fields in the campaign insert

**File: `src/pages/CampaignDetailPage.tsx`**
- Add badges for new statuses: `dnc`, `disconnected`, `call_me_later`, `not_available`
- Show redial settings in campaign header (max attempts, delay, retryable statuses)
- Update stats: "Completed" only counts `completed` + `dnc` + `disconnected` as truly finished
- Add "Retryable" count showing contacts eligible for redial
- Show attempt count per contact in the contacts table

### Flow diagram

```text
Call ends -> Webhook sets contact status
  |
  +--> completed/dnc/disconnected/failed/cancelled -> TERMINAL (no redial)
  |
  +--> voicemail/no_answer/busy/call_me_later/not_available -> RETRYABLE
         |
         tick-campaign checks:
           attempts < max_attempts?
           called_at older than redial_delay?
           status in redial_statuses?
             |
             YES -> reset to "queued", dial again
             NO  -> leave as-is (exhausted attempts)
```

### Files changed

| File | Change |
|---|---|
| Migration (new) | Add 3 columns to campaigns table |
| `tick-campaign/index.ts` | Add redial pass before marking campaign completed |
| `receive-bland-webhook/index.ts` | Add new status mappings, increment attempts |
| `receive-retell-webhook/index.ts` | Add new status mappings, increment attempts |
| `src/pages/CampaignsPage.tsx` | Add redial settings to campaign creation form |
| `src/pages/CampaignDetailPage.tsx` | New status badges, redial stats, attempt count column |

