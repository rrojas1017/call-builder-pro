

# Build the Inbound Call Pipeline

## Current Gap

The infrastructure for purchasing and assigning phone numbers already works. When someone calls an assigned number, Retell routes it to the correct agent and the agent handles the conversation. However, when the call ends:

- The webhook receives the call data but can't identify which organization or agent it belongs to (inbound calls don't carry the custom metadata that outbound calls do)
- All calls are recorded as "outbound" direction
- No call record is created in the database for inbound calls
- No evaluation, cost tracking, or CRM updates happen for inbound calls

## Solution

### 1. Update the Retell Webhook to Detect and Route Inbound Calls

When the webhook receives a `call_ended` event without the expected metadata (org_id, project_id), it should:

- Check if the call has a `to_number` (the number that was called)
- Look up that phone number in the `inbound_numbers` table to find the `org_id` and `project_id`
- If found, process it as an inbound call with all the same pipeline steps (call record, cost tracking, evaluation, CRM upsert)
- Set `direction: "inbound"` and link the `inbound_number_id`

### 2. Inject Metadata During Number Assignment

When assigning a number to an agent (in `manage-inbound-numbers`), also configure the Retell phone number with `inbound_webhook_metadata` containing org_id and project_id. This way, Retell will include this metadata in webhook payloads for inbound calls, making routing simpler and more reliable.

### 3. Handle `call_started` for Inbound Calls

The current `call_started` handler only creates records for outbound calls. Update it to also detect inbound calls (via metadata or phone number lookup) and create in-progress call records with `direction: "inbound"`.

## Technical Details

### Modified: `supabase/functions/receive-retell-webhook/index.ts`

Add an inbound detection block after extracting metadata:

```text
// After extracting metadata from callData:
// 1. If metadata is empty/missing org_id, check if this is an inbound call
// 2. Look up callData.to_number in inbound_numbers table
// 3. If found, populate metadata with org_id, project_id, inbound_number_id
// 4. Set direction = "inbound"
// 5. Also check callData.from_number for CRM phone lookup
```

Key changes:
- New helper function `resolveInboundMetadata(supabase, callData)` that returns org_id, project_id, inbound_number_id
- `call_started` handler updated to handle inbound
- `call_ended` / `call_analyzed` flow updated to set `direction: "inbound"` and `inbound_number_id`
- CRM upsert uses the caller's phone number (from_number) instead of to_number
- Cost tracking and evaluation work identically to outbound

### Modified: `supabase/functions/manage-inbound-numbers/index.ts`

In the "assign" action, after setting `inbound_agent_id` on Retell, also set metadata on the phone number so Retell passes it through in webhooks:

```text
// After PATCH /update-phone-number:
// Include: metadata: { org_id, project_id }
// (Retell forwards this metadata in webhook payloads for inbound calls)
```

## Call Flow After Implementation

```text
1. Caller dials your purchased number
2. Retell routes to assigned agent (already works)
3. Agent handles conversation using its prompt/voice (already works)
4. Call ends -> Retell sends webhook to receive-retell-webhook
5. Webhook detects inbound call via metadata or phone number lookup
6. Creates call record with direction="inbound", links inbound_number_id
7. Fetches cost from Retell API, deducts credits
8. Triggers evaluate-call for quality scoring
9. Upserts CRM record using caller's phone number
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/receive-retell-webhook/index.ts` | Add inbound call detection, routing, and processing |
| `supabase/functions/manage-inbound-numbers/index.ts` | Inject metadata when assigning numbers for webhook routing |

