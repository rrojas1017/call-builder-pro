

# Fix: Retell API Payload Field Names

## Problem
The `run-test-run` edge function sends incorrect field names to the Retell `create-phone-call` API, causing calls to fail. The Retell API documentation specifies different field names than what our code currently uses.

## Incorrect vs Correct Fields

| Current (Wrong)    | Retell API (Correct)   |
|--------------------|------------------------|
| `phone_number`     | `to_number`            |
| `agent_id`         | `override_agent_id`    |
| `webhook_url`      | _(not a valid param)_  |

## Changes

### 1. Edge function `run-test-run/index.ts` (Retell branch)
Update the Retell payload construction (around lines 127-136):
- Rename `phone_number` to `to_number`
- Rename `agent_id` to `override_agent_id`
- Remove `webhook_url` (not a valid Retell API parameter; webhooks are configured in the Retell dashboard or via agent settings)
- Keep `from_number`, `metadata` as-is (these are correct)

### 2. Edge function `tick-campaign/index.ts` (Retell branch)
Apply the same field name corrections in the campaign tick function's Retell call payload.

## Technical Details

The corrected Retell payload will look like:
```
{
  override_agent_id: retellAgentId,
  to_number: contact.phone,
  from_number: resolvedFromNumber,
  metadata: { ... }
}
```

This matches the Retell API spec at `POST /v2/create-phone-call` which requires:
- `from_number` (required) - E.164 format, must be purchased/imported in Retell
- `to_number` (required) - E.164 format destination number
- `override_agent_id` (optional) - one-time agent override for this call
- `metadata` (optional) - arbitrary storage object

