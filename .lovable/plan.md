

## Fix Voicemail Override Incorrectly Overwriting Successful Calls

### The bug

When answering machine detection is enabled, Bland sends an `answered_by` field. For calls where it can't determine who picked up, it sends `answered_by: "unknown"`. Our webhook treats `"unknown"` as voicemail, which overwrites legitimate completed calls (like Ramon Rojas's successful qualification and transfer) with a "voicemail" status.

### The fix

Only apply the `answered_by` override when there is NO meaningful conversation. If the transcript contains a real back-and-forth conversation (both assistant and user turns), the call was clearly answered by a human -- `answered_by: "unknown"` should be ignored.

### Changes

**File: `supabase/functions/receive-bland-webhook/index.ts`**

Replace the blanket `answered_by` override (lines 49-53) with smart logic:

```
const answeredBy = body.answered_by || null;
const hasRealConversation = transcript && transcript.includes("user:") && transcript.length > 200;

if ((answeredBy === "voicemail" || answeredBy === "machine") && !hasRealConversation) {
  contactStatus = "voicemail";
}
// "unknown" only overrides if there's no real conversation
if (answeredBy === "unknown" && !hasRealConversation) {
  contactStatus = "voicemail";
}
```

This ensures:
- Calls with `answered_by: "voicemail"` or `"machine"` AND no real transcript -> correctly marked as voicemail
- Calls with `answered_by: "unknown"` but a full conversation transcript -> stay as "completed"
- Calls with no `answered_by` field -> unchanged behavior

**File: `supabase/functions/receive-retell-webhook/index.ts`**

Apply the same transcript-aware logic to the Retell webhook for consistency.

**Data fix:** Update Ramon Rojas's contact record to correct status from "voicemail" to "completed".

### Files changed

| File | Change |
|---|---|
| `supabase/functions/receive-bland-webhook/index.ts` | Make voicemail override transcript-aware |
| `supabase/functions/receive-retell-webhook/index.ts` | Same fix for Retell provider |
| Database | Fix Ramon Rojas's contact status |

