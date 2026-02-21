

# Fix: Remove Remaining Bland AI References

## Problem
The previous migration was incomplete -- there are still many Bland references across frontend files and one edge function that need to be cleaned up.

## Changes Required

### 1. `src/pages/CreateAgentPage.tsx`
- **Line 311**: Remove `backgroundTrack` state variable
- **Line 312**: Change `voiceProvider` default from `"bland"` to `"retell"`, then simplify type to just `string` or remove entirely
- **Lines 689-714**: Remove the entire "Voice Provider" toggle section (the Voz/Append two-button grid)
- **Lines 715-752**: The Retell agent manager block currently gated behind `voiceProvider === "retell"` -- make it always visible (remove the condition)
- **Lines 778-804**: The voice selection section gated behind `voiceProvider === "bland"` -- change to always show (this section now uses `retellVoices` so it's correct)
- **Lines 806-841**: Remove entire "Background Audio" section (Bland-only feature)
- **Line 453**: Remove `background_track: backgroundTrack` from spec save
- **Line 454**: Hardcode `voice_provider: "retell"` instead of using variable
- **Line 455**: Simplify to always set `retell_agent_id: finalRetellAgentId || null`
- **Line 424**: Remove the `voiceProvider === "retell"` condition for auto-creating Retell agents -- always create

### 2. `src/pages/EditAgentPage.tsx`
- **Line 36**: Remove `backgroundTrack` state
- **Line 37**: Remove `voiceProvider` state (or hardcode to `"retell"`)
- **Lines 63-64**: Remove loading `background_track` and `voice_provider` from DB into state
- **Line 97-98**: Hardcode `background_track: null` and `voice_provider: "retell"` in save handler
- **Line 99**: Simplify `retell_agent_id` to always save (remove condition)
- **Lines 140-165**: Remove the entire Voice Provider toggle UI
- **Lines 166+**: Make the Retell agent manager always visible
- **Lines 288-323**: Remove entire Background Audio section

### 3. `src/pages/InboundNumbersPage.tsx`
- **Line 60**: Remove `provider` state
- **Lines 118-132**: Simplify `handlePurchase` to always use `manage-retell-numbers` (remove the `if/else` branches)
- **Lines 220-241**: Remove the provider toggle grid in the purchase dialog
- **Line 256**: Simplify cost text to always show "$2.00 billed through Append"

### 4. `src/pages/UniversityPage.tsx`
- **Line 34**: Remove `bland_call_id` from interface
- **Lines 419, 427-428, 449**: Replace `bland_call_id` references with just `retell_call_id`
- **Line 428**: Remove provider detection logic, always pass `provider: "retell"`

### 5. `src/pages/CampaignDetailPage.tsx`
- **Line 250**: Change default provider param from `"bland"` to `"retell"`
- **Lines 303-304**: Simplify to use `retell_call_id` only
- **Lines 546, 552-554**: Replace `bland_call_id` checks with `retell_call_id`

### 6. `src/pages/CallsPage.tsx`
- **Line 25**: Remove `bland_call_id` from the `Call` interface

### 7. `src/pages/TrainingAuditPage.tsx`
- **Lines 41, 50, 83**: Rename `bland_config` to `voice_config` in interfaces and UI label (changing "Bland AI Config" to "Voice AI Config")

### 8. `supabase/functions/audit-training-pipeline/index.ts`
- Rename all `bland_config` references to `voice_config`
- Update the system prompt text to say "voice AI" instead of "Bland AI"
- Update category references in the prompt and schema

## Notes
- Database columns (`bland_call_id`, etc.) are intentionally kept for historical data
- The `TrainingAuditPage` and `audit-training-pipeline` changes are cosmetic renames to avoid confusing the user with "Bland" branding

