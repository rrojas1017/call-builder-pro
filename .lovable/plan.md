

## Switch Campaign Dialing to Bland AI Batch API

### Problem
The current `tick-campaign` edge function dispatches calls **one at a time** in a loop using `/v1/calls`. This is slow, doesn't scale well, and doesn't leverage Bland's native batch infrastructure which handles concurrency, scheduling, and error recovery automatically.

### Solution
Replace the per-contact loop in `tick-campaign` with a single call to Bland's **Batch API** (`POST https://api.bland.ai/v2/batches/create`), and store the `batch_id` on the campaign for tracking.

### How Bland Batch API Works

The batch endpoint accepts:
- `call_objects`: array of per-contact overrides (each needs `phone_number`, can override `first_sentence`, metadata, etc.)
- `global`: shared settings applied to all calls (task prompt, voice, record, webhook, transfer number, model, language, etc.)

This maps perfectly to the campaign model -- the agent spec provides the `global` config, and each contact row provides per-call overrides.

### Changes

**1. Database Migration**
- Add `bland_batch_id` (text, nullable) column to `campaigns` table to track the batch

**2. Edge Function: `supabase/functions/tick-campaign/index.ts`** -- Rewrite dispatch logic
- Instead of looping through contacts and calling `/v1/calls` one by one:
  - Gather ALL queued contacts for the campaign
  - Build a `call_objects` array with each contact's `phone_number`, `first_sentence` (template-replaced), and `metadata` (org_id, project_id, campaign_id, contact_id, version)
  - Build a `global` object with: `task` (the prompt), `record: true`, `webhook`, `voice_id`, `transfer_phone_number`, `from` number, `model`, `language`, `summary_prompt`
  - Send a single `POST` to `https://api.bland.ai/v2/batches/create` (note: US endpoint `us.api.bland.ai` -- will check if batch endpoint uses same base)
  - Store the returned `batch_id` on the campaign
  - Mark all dispatched contacts as `status: "calling"`
- Keep the existing `buildTaskPrompt()` and `replaceTemplateVars()` functions
- Keep global human behaviors injection

**3. Edge Function: `supabase/functions/start-campaign/index.ts`** -- Minor update
- No significant changes needed, it already just sets status to "running" and triggers tick-campaign

**4. No frontend changes needed**
- The Lists page, Campaigns page, and Campaign Detail page remain the same
- The webhook (`receive-bland-webhook`) already handles individual call completions, so batch results flow through the same path

### Batch Payload Structure

```text
POST https://api.bland.ai/v2/batches/create

{
  "global": {
    "task": "<built prompt with global behaviors>",
    "record": true,
    "webhook": "<webhook URL>",
    "voice_id": "maya",
    "transfer_phone_number": "+15551234567",
    "from": "+15559876543",
    "summary_prompt": "Return JSON with: consent, state, age...",
    "model": "base"
  },
  "call_objects": [
    {
      "phone_number": "+15551110001",
      "first_sentence": "Hey John, you got a quick minute?...",
      "metadata": {
        "org_id": "...",
        "project_id": "...",
        "campaign_id": "...",
        "contact_id": "...",
        "version": 3
      }
    },
    {
      "phone_number": "+15551110002",
      "first_sentence": "Hey Sarah, you got a quick minute?...",
      "metadata": { ... }
    }
  ]
}
```

### Technical Details

- The Bland batch API uses `https://api.bland.ai/v2/batches/create` (v2 endpoint). The existing single-call endpoint uses `https://us.api.bland.ai/v1/calls`. The batch endpoint does not have a regional variant documented, so we'll use `https://api.bland.ai/v2/batches/create`.
- Each call object in the batch follows the same schema as `/v1/calls`, so all existing fields (metadata, webhook, first_sentence) carry over.
- The webhook still fires per-call, so `receive-bland-webhook` continues working unchanged.
- Contacts are batch-updated to `status: "calling"` after dispatch instead of one-by-one.
- If the batch API returns errors for specific call objects, we mark those contacts as `failed`.
- The `max_concurrent_calls` setting on campaigns is no longer needed for throttling since Bland handles batch concurrency internally, but we'll keep the column for backwards compatibility.

### Files Modified
- `supabase/functions/tick-campaign/index.ts` -- Rewrite to use batch API
- New migration: add `bland_batch_id` to `campaigns`

### Files NOT Modified
- `src/pages/ListsPage.tsx` -- Upload flow stays the same
- `src/pages/CampaignsPage.tsx` -- Campaign creation stays the same
- `supabase/functions/receive-bland-webhook/index.ts` -- Webhook handling stays the same
- `supabase/functions/start-campaign/index.ts` -- No changes needed

