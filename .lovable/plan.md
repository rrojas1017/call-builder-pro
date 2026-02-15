

## Fix Live Transcription in Campaign Drawer + Confirm Learning Loop

### Problem 1: Live transcript not showing

The drawer shows nothing because `bland_call_id` is only written to the contact **after the call ends** (in the webhook). During a live call, the contact has `status: "calling"` but `bland_call_id: null`, so the `LiveCallMonitor` never renders.

**Root cause:** The Bland Batch API returns a `batch_id`, not individual call IDs. Individual `call_id`s only arrive via the webhook when each call finishes.

**Fix:** After creating the batch in `tick-campaign`, poll Bland's batch details endpoint (`GET /v2/batches/{batch_id}`) to retrieve individual call IDs and write them to each contact row immediately. This way, when a user clicks a "calling" contact, `bland_call_id` is already populated and `LiveCallMonitor` can fetch the live transcript.

### Problem 2: Learning loop confirmation

The continuous retraining pipeline is fully wired and working:

```text
Call completes (webhook)
  --> evaluate-call (AI scoring + coaching)
      --> Auto-apply humanness suggestions to agent spec
      --> Auto-research when humanness < 80 or knowledge gaps detected
      --> learn-from-success every 5th qualified call (extracts winning patterns)
      --> Auto-graduation level update
      --> Score snapshots + voice recommendations
```

No changes needed here -- just needs completed calls with transcripts to fire. Voicemail detection fix (already deployed) will help by preventing false "completed" statuses.

---

### Changes

**File: `supabase/functions/tick-campaign/index.ts`**

After the Bland batch is created and contacts are set to "calling" (around line 271), add a delayed poll of the batch details:

1. Wait 3 seconds for Bland to register the batch
2. `GET /v2/batches/{batch_id}` to retrieve the list of calls with their individual `call_id` and `phone_number`
3. Match each call's phone number to the contacts that were just dispatched
4. Update each contact's `bland_call_id` with the matched call ID

This is a best-effort operation -- if the poll fails, the system still works (live monitoring just won't be available, and the webhook will fill in the ID later).

**File: `src/pages/CampaignDetailPage.tsx`**

Update the `LiveCallMonitor` condition in the drawer to also check for `bland_call_id` from the `calls` table (as a fallback), and ensure that any realtime update that populates `bland_call_id` on the contact triggers a re-render showing the monitor.

### Technical detail

**tick-campaign batch ID resolution (new code after line 271):**

```typescript
// Best-effort: resolve individual call IDs from batch
try {
  await new Promise(r => setTimeout(r, 3000));
  const batchDetailResp = await fetch(
    `https://api.bland.ai/v2/batches/${batchId}`,
    { headers: { Authorization: BLAND_API_KEY } }
  );
  if (batchDetailResp.ok) {
    const batchDetail = await batchDetailResp.json();
    const batchCalls = batchDetail.call_data || batchDetail.calls || [];
    for (const bc of batchCalls) {
      const callId = bc.call_id || bc.id;
      const phone = bc.phone_number || bc.to;
      if (callId && phone) {
        const match = contacts.find(c => c.phone === phone);
        if (match) {
          await supabase.from("contacts")
            .update({ bland_call_id: callId })
            .eq("id", match.id);
        }
      }
    }
    console.log(`Resolved ${batchCalls.length} call IDs from batch ${batchId}`);
  }
} catch (e) {
  console.error("Failed to resolve batch call IDs (non-fatal):", e);
}
```

### Files changed

| File | Change |
|---|---|
| `supabase/functions/tick-campaign/index.ts` | Add batch call ID resolution after batch creation |

