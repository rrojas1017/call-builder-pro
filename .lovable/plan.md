

# Fix: Voice ID Validation Blocking Valid Voices + Transfer Verification

## Problems Found (Verified via Backend Testing)

### 1. Voice ID validation is broken
The `isValidRetellVoiceId()` function only allows voice IDs starting with specific prefixes (`11labs-`, `cartesia-`, `minimax-`, etc.). This blocks:
- Short Retell preset names like `"maya"` (stored in DB for some agents)
- Custom cloned voice UUIDs like `ff2c405b-3dba-41e0-9261-bc8ee3f91f46`

Result: voice_id is silently skipped during agent updates, so the agent stays on the default `11labs-Adrian`.

### 2. Some agents have invalid voice IDs in the database
Two agents have `voice_id: "maya"` which is NOT a valid Retell voice ID. The correct ID from Retell's voice list would be something like `minimax-Maya` or similar. However, `"maya"` doesn't appear in the available voices at all -- it may have been entered manually or from an old provider.

### 3. Transfer call format -- CONFIRMED WORKING
The transfer_call format with `type: "predefined"` and `transfer_option` is correct and deployed. The LLM patch succeeded in my backend test (no errors). This just needs a fresh test call.

## Fixes

### A. Remove the broken `isValidRetellVoiceId` gate (`manage-retell-agent/index.ts`)

Replace the restrictive prefix-based validation with a simple truthy check. If a voice_id is provided, send it to Retell and let Retell validate it (Retell returns a clear error if invalid).

**In `buildAgentBody`** (line 52): Change from prefix check to simple existence check:
```typescript
// Before: silently defaults to Adrian if prefix doesn't match
const voiceId = isValidRetellVoiceId(config.voice_id) ? config.voice_id : "11labs-Adrian";

// After: send whatever voice_id is provided, fallback only if empty
const voiceId = config.voice_id || "11labs-Adrian";
```

**In update action** (around line 243): Same change -- remove the `isValidRetellVoiceId` guard:
```typescript
// Before
if (config?.voice_id && isValidRetellVoiceId(config.voice_id)) {
  body.voice_id = config.voice_id;
}

// After
if (config?.voice_id) {
  body.voice_id = config.voice_id;
}
```

### B. Fix the bad voice_id data in the database

The two agents with `voice_id: "maya"` need to be corrected. Based on the user's screenshots showing "Ashley" selected, and the Retell voice list showing `minimax-Ashley` as the correct ID, update these records.

### C. Keep the `isValidRetellVoiceId` function for reference but stop using it as a gate

The function can remain for logging/diagnostics but should not block voice updates.

## Files to Modify
- `supabase/functions/manage-retell-agent/index.ts` -- Remove voice_id validation gate in create and update actions
- Database: Fix `voice_id` from `"maya"` to `"minimax-Ashley"` for affected agents

## Expected Outcome
- Voice updates will actually reach Retell
- The agent will use the voice the user selected in the UI
- Invalid voice IDs will get a clear Retell error instead of being silently ignored
- Transfer calls confirmed working (format is correct, just needs re-test)

