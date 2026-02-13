
## Fix Bland Inbound Configuration — Apply Correct API Field Names

### Problem
The `manage-inbound-numbers` edge function's ASSIGN action is using incorrect field names when configuring inbound numbers on Bland AI:
1. Line 133 uses `voice_id` but Bland expects `voice`
2. Missing `first_sentence` parameter (mapped from agent's `opening_line`) — without it, the agent stays silent on pickup
3. Missing explicit `language` field
4. No logging of Bland's configuration response, making it hard to debug issues

This causes inbound calls to ring and drop immediately without the agent ever engaging.

### Solution
Update the ASSIGN action (lines 128-145) in `supabase/functions/manage-inbound-numbers/index.ts`:

**Changes to the configuration body** (lines 128-135):
- Replace `configBody.voice_id = spec.voice_id` with `configBody.voice = spec.voice_id`
- Add `configBody.first_sentence = spec.opening_line` to provide the agent's greeting
- Add `configBody.language = spec.language || "en"` for explicit language setting

**Add response logging** (after line 141):
- Parse and log the full response from Bland's configuration endpoint
- This reveals any errors Bland returns about the configuration

**Update error handling** (line 142-144):
- Ensure the error message includes the actual Bland response for better debugging

### Technical Details

**Current code (lines 133-135):**
```
if (spec.voice_id) configBody.voice_id = spec.voice_id;
if (spec.transfer_phone_number) configBody.transfer_phone_number = spec.transfer_phone_number;
if (spec.background_track && spec.background_track !== "none") configBody.background_track = spec.background_track;
```

**Updated code:**
```
if (spec.voice_id) configBody.voice = spec.voice_id;
if (spec.opening_line) configBody.first_sentence = spec.opening_line;
if (spec.language) configBody.language = spec.language;
if (spec.transfer_phone_number) configBody.transfer_phone_number = spec.transfer_phone_number;
if (spec.background_track && spec.background_track !== "none") configBody.background_track = spec.background_track;
```

**Add logging after the fetch (after line 141):**
```
const configData = await configResp.json();
console.log("Bland inbound config response:", JSON.stringify(configData));
```

### Impact
- ✅ Agent will greet callers with the configured opening line on pickup
- ✅ Voice configuration will be correctly recognized by Bland
- ✅ Language settings will be properly transmitted
- ✅ Full conversation flow will complete without dropping
- ✅ Call webhooks will fire correctly, creating proper call records in the database

### Files Modified
- `supabase/functions/manage-inbound-numbers/index.ts` (ASSIGN section, lines 128-145)

### No Database Changes Required
This is purely an edge function configuration fix aligned with Bland's API specification.

