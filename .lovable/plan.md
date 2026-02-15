

## Pulsing Live Indicator + Fix Voicemail/Machine Detection

### Problem 1: No visual cue for live calls
Contact rows with active calls look the same as every other row. Users can't tell which ones have live conversations to click into.

### Problem 2: Voicemail detection not working
The Bland webhook currently only checks `body.status` to determine contact status. But when `answering_machine_detection` is enabled, Bland sends `status: "completed"` with a separate `answered_by: "voicemail"` field. The system ignores this field, so voicemail calls are incorrectly marked as "completed" instead of "voicemail". The same applies to calls blocked by call-screening systems.

---

### Changes

**File: `src/pages/CampaignDetailPage.tsx`**

1. Add a pulsing green dot next to the status badge when `contact.status === "calling"`:
   - A small animated circle (`animate-pulse`) with a green background
   - Applied inline next to the badge in the Status column
   - Makes it immediately obvious which contacts have live calls

**File: `supabase/functions/receive-bland-webhook/index.ts`**

2. After extracting `status`, check `body.answered_by`:
   - If `answered_by === "voicemail"` -> override `contactStatus` to `"voicemail"` regardless of the `status` field
   - If `answered_by === "machine"` or `answered_by === "unknown"` -> set `contactStatus` to `"voicemail"` (machine/IVR systems are functionally voicemail)
   - Only keep `contactStatus = "completed"` when `answered_by === "human"` or `answered_by` is null (detection not enabled)

**File: `supabase/functions/receive-retell-webhook/index.ts`**

3. Same pattern for Retell: check `callData.answered_by` or `callData.call_analysis?.user_sentiment` for machine detection signals and map accordingly.

### Technical detail

**Bland webhook fix (critical):**
```
// After line 26 (status extraction):
const answeredBy = body.answered_by || null;

// After status mapping block (line 47), add override:
if (answeredBy === "voicemail" || answeredBy === "machine" || answeredBy === "unknown") {
  contactStatus = "voicemail";
}
```

This ensures that even when Bland reports `status: "completed"`, a call answered by a voicemail system gets the correct `voicemail` status and becomes eligible for auto-redial.

**Pulsing indicator (UI):**
```tsx
<TableCell>
  <div className="flex items-center gap-2">
    {c.status === "calling" && (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    )}
    <Badge variant={badge.variant}>{badge.label}</Badge>
  </div>
</TableCell>
```

### Files changed

| File | Change |
|---|---|
| `src/pages/CampaignDetailPage.tsx` | Add pulsing green dot on "calling" rows |
| `supabase/functions/receive-bland-webhook/index.ts` | Check `answered_by` field to correctly detect voicemails |
| `supabase/functions/receive-retell-webhook/index.ts` | Check for machine detection signals |

