

## Fix "No WebSocket URL returned" for Listen Live

### Root Cause

The Bland AI Listen endpoint (`POST /v1/calls/{call_id}/listen`) returns a **nested** response:

```json
{
  "status": "success",
  "data": {
    "url": "wss://api.bland.ai/ws/listen/call_123456"
  }
}
```

But line 95 of `live-call-stream/index.ts` reads from the top level:

```typescript
{ websocket_url: data.url || data.websocket_url }  // both undefined!
```

This always returns `{ websocket_url: undefined }`, which the frontend interprets as "No WebSocket URL returned".

### Fix

**File: `supabase/functions/live-call-stream/index.ts` (line 95)**

Change the response extraction to check the nested `data.data.url` path first:

```typescript
const wsUrl = data?.data?.url || data?.url || data?.websocket_url;
return new Response(JSON.stringify({ websocket_url: wsUrl }), { ... });
```

This handles all possible response shapes from Bland's API while fixing the primary nested format.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/live-call-stream/index.ts` | Fix WebSocket URL extraction from `data.data.url` instead of `data.url` |

