

## Three Issues to Fix

### 1. Voicemail Message: Leave a message instead of hanging up

Currently, campaigns use `answering_machine_detection: true` which just disconnects on voicemail. Bland AI supports a `voicemail` object that can leave a message instead.

**Changes:**

**Database migration** -- Add `voicemail_message` column to `agent_specs`:
```sql
ALTER TABLE agent_specs ADD COLUMN voicemail_message text;
```

**File: `supabase/functions/tick-campaign/index.ts`** -- Replace `answering_machine_detection: true` with the voicemail object:
```typescript
// Replace line 286:
// globalSettings.answering_machine_detection = true;

// With:
if (spec.voicemail_message) {
  globalSettings.voicemail = {
    action: "leave_message",
    message: spec.voicemail_message,
  };
} else {
  globalSettings.answering_machine_detection = true;
}
```

**File: `supabase/functions/receive-bland-webhook/index.ts`** -- Add a new outcome for successful voicemail delivery. When `answeredBy === "voicemail"` and there IS a voicemail message configured, set outcome to `"left_message"` instead of just `"voicemail"`:
```typescript
// After the existing voicemail detection block, add:
if (contactStatus === "voicemail" && body.voicemail_detected && body.voicemail_left) {
  outcome = "left_message";
}
```

**File: `src/pages/EditAgentPage.tsx`** -- Add a "Voicemail Message" textarea field in the agent settings so users can write their message.

**File: `src/pages/CampaignDetailPage.tsx`** -- Add `"left_message"` to the outcome badge mapping (yellow/secondary badge).

### 2. Inbound Number Config Missing Parameters (Male/Untrained Voice Bug)

The `manage-inbound-numbers` assign action is missing critical parameters that `run-test-run` (University) includes. This is why calling the inbound number from a real phone sounds like a completely different (male, untrained) agent.

**Missing parameters in `manage-inbound-numbers/index.ts` assign block:**
- `model: "base"` -- without this, Bland may default to a different model/voice
- `temperature`
- `interruption_threshold`
- `noise_cancellation`
- `voice_settings` (speaking speed)
- `pronunciation_guide`
- `record: true`

**File: `supabase/functions/manage-inbound-numbers/index.ts`** -- In the assign action (around line 116), add all missing parameters to `configBody`:
```typescript
const configBody: any = {
  prompt: task,
  webhook: webhookUrl,
  model: "base",
  voice: spec.voice_id || "maya",
  temperature: spec.temperature ?? 0.7,
  interruption_threshold: spec.interruption_threshold ?? 100,
  noise_cancellation: true,
  record: true,
  metadata: { org_id: project?.org_id || num.org_id, project_id },
};

// Conditional params (matching run-test-run exactly)
if (spec.opening_line) configBody.first_sentence = spec.opening_line;
if (spec.language) configBody.language = spec.language;
if (spec.transfer_phone_number) configBody.transfer_phone_number = spec.transfer_phone_number;
if (spec.background_track && spec.background_track !== "none")
  configBody.background_track = spec.background_track;
if (spec.speaking_speed && spec.speaking_speed !== 1.0)
  configBody.voice_settings = { speed: spec.speaking_speed };
if (spec.pronunciation_guide && Array.isArray(spec.pronunciation_guide) && spec.pronunciation_guide.length > 0)
  configBody.pronunciation_guide = spec.pronunciation_guide;
```

This removes the separate `if (spec.voice_id) / else` block and ensures full parity with the University/campaign call configuration.

### 3. "Left Message" Outcome in Campaign Detail

**File: `src/pages/CampaignDetailPage.tsx`** -- Add `left_message` to the outcome badge map with a distinct color so users can see when a voicemail was successfully left vs. just detected.

### Summary

| Change | File | What |
|--------|------|------|
| DB migration | SQL | Add `voicemail_message` to `agent_specs` |
| Voicemail delivery | `tick-campaign/index.ts` | Use Bland's `voicemail` object when message is configured |
| Outcome tracking | `receive-bland-webhook/index.ts` | Map successful voicemail to `left_message` outcome |
| Agent UI | `EditAgentPage.tsx` | Add voicemail message textarea |
| Inbound parity | `manage-inbound-numbers/index.ts` | Add all missing Bland params (model, temp, etc.) |
| Outcome badge | `CampaignDetailPage.tsx` | Add `left_message` badge |

