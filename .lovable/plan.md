

## Separate Status (Lifecycle) from Outcome (Result)

Currently the "Status" column shows everything (queued, calling, completed, voicemail, no_answer, etc.) mixing lifecycle state with call results. The fix splits these into two clear columns:

### Status Column (Call Lifecycle)
Shows where the contact is in the process:
- **Queued** -- waiting to be dialed
- **Dialing** -- call is currently being placed (was "In Progress")  
- **Connected** -- call connected and conversation happened (with live indicator when active)
- **Attempted** -- call was placed but didn't connect (no answer, voicemail, busy, etc.)

### Outcome Column (What Happened)
Shows the result once the call finishes:
- For connected calls: qualified, disqualified, completed, callback, etc.
- For non-connected: voicemail, no_answer, busy, disconnected, DNC, failed
- Blank/dash while queued or still dialing

### Technical Change

**File: `src/pages/CampaignDetailPage.tsx`**

1. Add a helper function that maps the raw `contact.status` to a display status:
   - `queued` -> "Queued"
   - `calling` -> "Dialing" (with live pulse dot)
   - `completed`, `qualified`, `disqualified` -> "Connected"
   - `voicemail`, `no_answer`, `busy`, `call_me_later`, `not_available` -> "Attempted"
   - `failed`, `disconnected`, `dnc`, `cancelled` -> "Attempted"

2. The **Outcome** column will show:
   - The `call.outcome` value from the calls table if available (qualified, disqualified, completed)
   - Otherwise fall back to the contact's raw status (voicemail, no_answer, busy, dnc, etc.)
   - Dash for queued/calling contacts

3. Update `STATUS_BADGES` to reflect the new lifecycle labels with appropriate colors:
   - Queued: outline
   - Dialing: green/secondary with pulse
   - Connected: green/default
   - Attempted: yellow/secondary

4. Outcome badges get their own color scheme based on the result value (qualified = green, DNC = red, voicemail = muted, etc.)

No backend changes needed -- this is purely a display-layer refactor in one file.
