

## Show Live Conversation in Contact Detail Drawer

When you click on a contact that has an active call (status "calling"), the detail drawer will show the LiveCallMonitor component -- the same live transcript feed and "Listen Live" button used in University.

### What changes

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Import `LiveCallMonitor`** from `@/components/LiveCallMonitor`.

2. **Add LiveCallMonitor to the drawer** -- inside the Sheet content, right after the header and before the call metadata section, render the LiveCallMonitor when the contact's status is `calling` and it has a `bland_call_id` or `retell_call_id`:

```
{contact.status === "calling" && (contact.bland_call_id || contact.retell_call_id) && (
  <LiveCallMonitor
    blandCallId={contact.bland_call_id}
    retellCallId={contact.retell_call_id}
    contactId={contact.id}
    isActive={true}
  />
)}
```

3. The existing evaluation/transcript/metadata sections remain and will show once the call completes (they render conditionally based on `call` data existing).

### Technical detail

| Area | Change |
|---|---|
| Import (line 6) | Add `LiveCallMonitor` import |
| Sheet content (~line 646) | Insert `LiveCallMonitor` component before call metadata |

This is a 2-line addition (1 import + 1 component render block) in a single file. The `LiveCallMonitor` component already handles transcript polling, live audio WebSocket, and cleanup -- no other changes needed.
