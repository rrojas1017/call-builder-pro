

# Fix Robotic-Sounding Test Calls

## Problem
The `run-test-run` edge function sends calls to Bland AI without specifying a `voice` or `model`, so it defaults to whatever Bland's default is -- which can sound robotic.

## Solution
Add voice and model configuration to the Bland API payload in `run-test-run/index.ts`, and optionally allow these to be stored in the agent spec.

## Changes

### 1. Update `run-test-run/index.ts` Bland payload (lines 149-162)
Add these parameters to the `blandPayload` object:
- `voice`: Set to a natural-sounding preset (e.g. `"maya"`) -- can be overridden from the agent spec
- `model`: Set to `"base"` (recommended by Bland for best script-following and natural sound)
- `voice_settings`: Optional stability/speed tuning

The payload will look like:
```text
blandPayload = {
  phone_number: contact.phone,
  task,
  first_sentence: spec?.opening_line || undefined,
  voice: spec?.voice_id || "maya",
  model: "base",
  record: true,
  webhook: webhookUrl,
  metadata: { ... },
}
```

### 2. Add `voice_id` column to `agent_specs` table
Add a nullable `voice_id` text column so each agent can have its own voice configured:
```text
ALTER TABLE agent_specs ADD COLUMN voice_id text DEFAULT NULL;
```

### 3. Update Create Agent / Agent Settings UI
Add a voice selection dropdown on the agent creation or settings page so users can pick from Bland's preset voices (e.g. maya, josh, matt, rachel, etc.) or paste a custom voice clone ID.

## Technical Details

- The `voice` parameter accepts preset names like `"maya"`, `"josh"`, `"matt"` or custom voice clone IDs
- The `model` parameter should be `"base"` for best quality (follows scripts most effectively and sounds more natural)
- If no `voice_id` is set in the spec, it defaults to `"maya"` which is one of Bland's most natural-sounding voices
- No new secrets or API keys are needed -- these are just additional body parameters in the existing Bland API call

