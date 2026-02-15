

## Voicemail Detection + Live Call Control on Campaign Dashboard

### Part 1: Voicemail Detection (Auto-Disconnect)

Bland AI already reports voicemail status in webhooks, and your webhook handler already maps it to `"voicemail"` status. The missing piece is telling Bland AI to **detect answering machines and hang up automatically** instead of leaving a message.

**File:** `supabase/functions/tick-campaign/index.ts`

Add `answering_machine_detection: true` to the Bland batch API `globalSettings`. This tells Bland to detect voicemails/answering machines and end the call immediately, which then triggers the webhook with `status: "voicemail"`.

### Part 2: Live Call Visibility + Stop Button on Campaign Dashboard

Currently the campaign detail page shows contacts in a table but has no way to see which calls are live or stop them. We need to:

**File:** `src/pages/CampaignDetailPage.tsx`

1. **Add a "Live Calls" section** that filters contacts with `status === "calling"` and a non-null `bland_call_id`
2. **Add a "Stop" button** per live call that invokes the existing `stop-call` edge function (already built and working)
3. **Add a "Stop All" button** to terminate all active calls at once
4. **Add `cancelled` and `voicemail` to the status badges** so these new statuses display properly
5. **Increase the realtime refresh rate** from 15s to 5s while the campaign is running, so live calls appear/disappear faster

### Technical Details

| File | Change |
|---|---|
| `supabase/functions/tick-campaign/index.ts` | Add `answering_machine_detection: true` to Bland `globalSettings` (one line, ~line 200) |
| `src/pages/CampaignDetailPage.tsx` | Add "Live Calls" card with stop buttons above the contacts table. Add `voicemail`/`cancelled` status badges. Speed up polling to 5s. Import `PhoneOff` icon. |

**Bland `globalSettings` addition:**
```text
globalSettings.answering_machine_detection = true;
```

**Live Calls section (new card between KPIs and charts):**
- Filters contacts where `status === "calling"` and `bland_call_id` is set
- Each row shows name, phone, and a red "Stop" button
- "Stop All Active Calls" button at the top
- Stop action calls `supabase.functions.invoke("stop-call", { body: { call_id, contact_id } })`
- Section only appears when there are active calls

**New status badges:**
```text
cancelled: { label: "Cancelled", variant: "outline" }
voicemail: { label: "Voicemail", variant: "secondary" }
no_answer: { label: "No Answer", variant: "secondary" }
busy:      { label: "Busy", variant: "secondary" }
```

