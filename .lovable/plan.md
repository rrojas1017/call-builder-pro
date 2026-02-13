

## Rebrand Provider Names in the UI

### What Changes
Replace all user-facing references to the backend service names with your custom brand names:
- **"Bland AI" / "Bland"** becomes **"Voz"**
- **"Retell AI" / "Retell"** becomes **"Append"**

Internal database values (`voice_provider = 'bland'` / `'retell'`) stay exactly as they are -- only the display labels change. No backend or database modifications needed.

### Files to Modify

**1. `src/pages/EditAgentPage.tsx`**
- Line 135: `"Bland AI"` → `"Voz"`
- Line 136: description text → `"Primary provider with voice selection & background audio"`
- Line 145: `"Retell AI"` → `"Append"`
- Line 146: description text → `"Alternative provider — configure voice in the Append dashboard"`
- Line 151: `"Retell Agent ID"` → `"Append Agent ID"`
- Line 153: helper text → `"The agent ID from your Append dashboard."`
- Section heading "Voice Provider" stays as-is (it's generic)
- Comments like `{/* Voice Selection (Bland only) */}` updated to `{/* Voice Selection (Voz only) */}`

**2. `src/pages/CreateAgentPage.tsx`**
- Line 277: `"Bland AI"` → `"Voz"`
- Line 278: description text updated (remove "Current provider")
- Line 287: `"Retell AI"` → `"Append"`
- Line 288: description text updated (remove "Retell dashboard" reference)
- Line 293: `"Retell Agent ID"` → `"Append Agent ID"`
- Line 295: helper text updated
- Line 347: voice selection helper text updated (remove "Bland AI" reference)
- Comments updated similarly

**3. `src/pages/AgentsPage.tsx`**
- Line 124: Badge text `"Retell"` → `"Append"`, `"Bland"` → `"Voz"`

**4. `src/pages/CallsPage.tsx`**
- Line 141: Badge text `"Retell"` → `"Append"`, `"Bland"` → `"Voz"`

**5. `src/pages/GymPage.tsx`** (no display name changes needed -- only uses internal `bland_call_id` variable names which are not user-facing)

### What Stays Unchanged
- All database column values (`'bland'`, `'retell'`) -- these are internal identifiers
- All backend edge functions -- no user-facing text there
- All variable/state names in code (e.g., `voiceProvider`, `retellAgentId`) -- renaming these would be cosmetic churn with no user benefit
- Hook names like `useBlandVoices` -- internal only

