
## Add Voice Preview Playback to Agent Edit/Create Pages

### Problem
When selecting a voice in the Edit Agent page (and Create Agent page), users can't hear what the voices sound like before selecting them. They can only see the name and description, which makes it hard to pick the right voice.

### Solution
Add a "Play Sample" button next to each voice card that generates and plays a sample of that voice using the Bland AI `/v1/voices/{id}/sample` endpoint. This gives users instant audio feedback.

### Technical Approach

**1. New Edge Function: `generate-voice-sample`**
- Accepts `voice_id` and optional `text` parameter
- Calls `POST https://api.bland.ai/v1/voices/{voice_id}/sample` with Bland API key
- Returns the generated audio as binary MP3 data
- Falls back to a default text like "Hello, this is a voice sample" if no text provided

**2. Update `useBlandVoices` Hook**
- Extend the `BlandVoice` interface to optionally include `sample_url` (can be generated on demand)
- No breaking changes—this is additive

**3. Create `VoicePlayButton` Component**
- Small reusable component that wraps a play button with loading state
- On click, calls the new edge function to generate a sample
- Creates an `<audio>` element and plays the MP3 response
- Shows loading spinner during generation
- Shows error toast if generation fails
- Button becomes disabled during playback to prevent overlapping samples

**4. Update EditAgentPage Voice Cards**
- Add a `VoicePlayButton` to each voice card
- Show play icon + "Preview" label
- Position it in the bottom right of the card

**5. Update CreateAgentPage Voice Cards (Step 3)**
- Same `VoicePlayButton` treatment for consistency

### Flow
```
User clicks "Preview" button on voice card
    |
    v
Component calls generate-voice-sample edge function
with voice_id and sample text (e.g., the agent's opening line if available)
    |
    v
Edge function calls POST /v1/voices/{id}/sample to Bland API
    |
    v
Returns MP3 binary data
    |
    v
Frontend creates audio blob, plays it via <audio> element
    |
    v
User hears the voice sample
```

### Files to Create
- `supabase/functions/generate-voice-sample/index.ts` — edge function to proxy Bland API
- `src/components/VoicePlayButton.tsx` — reusable play button component

### Files to Modify
- `supabase/config.toml` — register new edge function
- `src/pages/EditAgentPage.tsx` — add VoicePlayButton to voice cards
- `src/pages/CreateAgentPage.tsx` — add VoicePlayButton to voice cards in Step 3
- `src/hooks/useBlandVoices.ts` — optional: extend BlandVoice interface for future enhancements

### What Users Will See
- Each voice card shows a small play/speaker icon button
- Clicking it generates a sample and plays it immediately
- During generation, the button shows a spinner
- Once generated, the sample plays through the browser's audio context
- If multiple samples are requested, only one plays at a time
