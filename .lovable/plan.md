

## Critical Bug: Campaign Uses Wrong Voice and Missing Agent Training

### Root Cause

There are **two separate issues** causing the campaign agent to sound different from the University agent:

### Issue 1: Voice Mismatch (Male vs Female)

The agent's `voice_id` is **null** in the database. Each flow handles this differently:

| Flow | Code | Result |
|---|---|---|
| **University** (run-test-run) | `voice: spec?.voice_id \|\| "maya"` | Falls back to **"maya"** (female) |
| **Campaign** (tick-campaign) | `if (spec.voice_id) globalSettings.voice_id = spec.voice_id;` | Condition is **false**, so **no voice is set at all** -- Bland picks its own default (male) |

### Issue 2: Missing Training Parameters in Campaign

The University flow sends these tuning parameters that make the agent sound "trained" and natural. The campaign flow **skips all of them**:

| Parameter | University (run-test-run) | Campaign (tick-campaign) |
|---|---|---|
| `temperature` | `spec.temperature ?? 0.7` (agent has 0.8) | **Not set** |
| `interruption_threshold` | `spec.interruption_threshold ?? 100` (agent has 800) | **Not set** |
| `speaking_speed` / `voice_settings` | Included when not 1.0 | **Not set** |
| `pronunciation_guide` | Included if present | **Not set** |
| `noise_cancellation` | `true` | **Not set** |
| `background_track` | Included if not "none" | Included (this one is fine) |

### Issue 3: Wrong API Parameter Name

The Batch API v2 used by campaigns takes `voice` (not `voice_id`) as the parameter for the global settings. The campaign currently uses `voice_id`, which may be silently ignored.

### Fix Plan

**File: `supabase/functions/tick-campaign/index.ts`** (lines 235-254)

1. Change `voice_id` to `voice` and add the "maya" fallback:
```typescript
globalSettings.voice = spec.voice_id || "maya";
```

2. Add all missing training parameters (mirror what run-test-run does):
```typescript
globalSettings.temperature = spec.temperature ?? 0.7;
globalSettings.interruption_threshold = spec.interruption_threshold ?? 100;
globalSettings.noise_cancellation = true;

if (spec.speaking_speed && spec.speaking_speed !== 1.0) {
  globalSettings.voice_settings = { speed: spec.speaking_speed };
}
if (spec.pronunciation_guide && Array.isArray(spec.pronunciation_guide) && spec.pronunciation_guide.length > 0) {
  globalSettings.pronunciation_guide = spec.pronunciation_guide;
}
if (spec.transfer_required && spec.transfer_phone_number) {
  const digits = spec.transfer_phone_number.replace(/\D/g, "");
  if (digits.length >= 10) {
    globalSettings.transfer_phone_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
  }
}
```

### Summary of Changes

| File | Change |
|---|---|
| `supabase/functions/tick-campaign/index.ts` | Fix voice parameter name (`voice` not `voice_id`), add "maya" fallback, add all missing training parameters (temperature, interruption_threshold, speaking_speed, pronunciation_guide, noise_cancellation) |

### Result

After this fix, campaigns will use the exact same voice and all the same tuning parameters as the University, ensuring the trained agent sounds identical in both environments.
