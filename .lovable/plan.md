

## Add Background Noise Option to Agents

### What This Does
Adds a toggle to enable ambient background audio during calls, making the agent sound like it's calling from a real environment (office, cafe, or restaurant). This is a native Bland AI feature (`background_track` parameter) -- no custom audio processing needed.

### Changes

**1. Database Migration**
- Add `background_track` column (text, nullable, default `null`) to `agent_specs` table
- Valid values: `null`/`"none"`, `"office"`, `"cafe"`, `"restaurant"`

**2. Agent Creation Page (`src/pages/CreateAgentPage.tsx`)**
- Add a "Background Audio" section in Step 3 (Review and Save), near the Voice Selection section
- Toggle: On/Off switch to enable background noise
- When enabled, show a selector with three options:
  - Office -- subtle keyboard clicks, phone rings, ambient chatter
  - Cafe -- coffee shop ambiance, background murmur
  - Restaurant -- dining sounds, background conversation
- Save the selected value to `agent_specs.background_track` alongside voice and transfer settings

**3. Agent Edit Page (`src/pages/EditAgentPage.tsx`)**
- Add the same "Background Audio" section with toggle and type selector
- Load the current value from the spec on page load
- Save it alongside other spec fields

**4. Test Run Edge Function (`supabase/functions/run-test-run/index.ts`)**
- Read `spec.background_track` from the agent spec
- If set and not `"none"`, add `background_track` to the Bland API payload

**5. Campaign Batch Edge Function (`supabase/functions/tick-campaign/index.ts`)**
- Read `spec.background_track` from the agent spec
- If set and not `"none"`, add `background_track` to the `globalSettings` object sent to the batch API

### UI Design
The background audio section will look like:

```text
+-----------------------------------------------+
| [Volume icon] Background Audio                 |
|                                                |
| [Toggle: Off / On]                             |
|                                                |
| (when on, show selector grid:)                 |
| [Office]  [Cafe]  [Restaurant]                 |
|  selected                                      |
+-----------------------------------------------+
```

Each option is a clickable card with the name and a short description, matching the existing "Call Ending" card style used elsewhere in the app.

### Files Modified
- New migration: add `background_track` to `agent_specs`
- `src/pages/CreateAgentPage.tsx` -- add background audio section in Step 3
- `src/pages/EditAgentPage.tsx` -- add background audio section
- `supabase/functions/run-test-run/index.ts` -- pass `background_track` to Bland API
- `supabase/functions/tick-campaign/index.ts` -- pass `background_track` in batch global settings
