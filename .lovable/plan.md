

## Fix Voice Preview Playback

### Root Causes
1. **Wrong API endpoint**: Using `us.api.bland.ai` but the documented endpoint is `api.bland.ai` -- there is no US regional variant for this endpoint
2. **Binary audio corruption**: `supabase.functions.invoke()` auto-parses the response as JSON, corrupting the binary MP3 data

### Changes

**1. Fix edge function endpoint (`supabase/functions/generate-voice-sample/index.ts`)**
- Change URL back to `https://api.bland.ai/v1/voices/${voice_id}/sample` (the documented endpoint)
- Keep the 25-second timeout as a safety measure

**2. Fix client-side binary handling (`src/components/VoicePlayButton.tsx`)**
- Replace `supabase.functions.invoke()` with a direct `fetch()` call to the edge function URL
- Use `response.blob()` to correctly handle the binary audio response
- This prevents the SDK from corrupting the MP3 data by trying to parse it as JSON

### Files to Modify
- `supabase/functions/generate-voice-sample/index.ts` -- fix API URL from `us.api.bland.ai` to `api.bland.ai`
- `src/components/VoicePlayButton.tsx` -- switch from SDK invoke to raw fetch for binary audio
