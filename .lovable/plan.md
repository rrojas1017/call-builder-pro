

# Fix Voice Selection and "maya" Default on Agent Creation

## Problem
Two issues are preventing agent creation:

1. **Retell API rejects the request** because `voice_id` is required but sent as `undefined`. The default voice is set to `"maya"` (a legacy shorthand), and line 751 explicitly strips it: `voiceId={selectedVoice !== "maya" ? selectedVoice : undefined}`. Since "maya" is not a real Retell voice ID, and `undefined` is not allowed by the API, agent creation always fails.

2. **Voice selector appears below the fold** -- the user may not realize they need to scroll down to pick a voice before clicking "Create Append Agent".

## Solution

### 1. Remove the "maya" default -- use a real Retell voice ID
Change the initial `selectedVoice` state from `"maya"` to an empty string `""`. This makes it clear no voice has been chosen yet.

### 2. Make `buildAgentBody` handle missing voice gracefully
In the edge function, if `voice_id` is not provided, use a sensible Retell default (`"11labs-Adrian"`) instead of sending `undefined`. This prevents the API error.

### 3. Remove the "maya" guard in the RetellAgentManager voiceId prop
The condition `selectedVoice !== "maya" ? selectedVoice : undefined` is no longer needed since we no longer default to "maya". Simply pass `selectedVoice || undefined`.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/CreateAgentPage.tsx` | Change default `selectedVoice` from `"maya"` to `""`. Update voiceId prop to remove maya check. |
| `supabase/functions/manage-retell-agent/index.ts` | In `buildAgentBody`, fall back to `"11labs-Adrian"` when no `voice_id` is provided so Retell never gets `undefined`. |

## Technical Details

**CreateAgentPage.tsx:**
- Line 307: `useState("maya")` becomes `useState("")`
- Line 751: `voiceId={selectedVoice !== "maya" ? selectedVoice : undefined}` becomes `voiceId={selectedVoice || undefined}`

**manage-retell-agent/index.ts:**
- Line 45-48: Add fallback: `const voiceId = config.voice_id || "11labs-Adrian";`

This ensures agent creation works even if the user hasn't explicitly selected a voice, while still respecting any voice they do choose.
