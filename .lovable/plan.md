

# Expand Spanish Voice Selection

## Problem

There are two issues causing the Spanish voice options to feel limited:

1. **Miscategorized voices** -- 3 Spanish voices are being classified as English:
   - "Mexican" accent voices (Miguel, Sofia) are not recognized as Spanish
   - "Hailey Latin America Spanish" has accent="American" in the API data, so it falls through to English
   
2. **Limited selection** -- Retell's built-in library only has ~9 Spanish voices total. ElevenLabs has hundreds of Spanish community voices that can be imported into Retell.

## Solution

### Part 1: Fix language detection (quick fix)

Update the `deriveLanguage` function in `src/hooks/useRetellVoices.ts` to also check:
- "mexican" accent --> Spanish
- "latin" in voice name or voice_id --> Spanish  
- voice_id containing "spanish" --> Spanish

This immediately surfaces 3 more voices under the Spanish filter.

### Part 2: Add ElevenLabs Spanish voice import

Retell has an API endpoint (`POST /add-community-voice`) that lets you import voices from the ElevenLabs community library directly into your Retell account. We can build a feature that:

1. Creates a new backend function `import-retell-voice` that calls Retell's add-community-voice API
2. Adds a curated list of high-quality ElevenLabs Spanish voices (pre-selected IDs) that users can import with one click
3. Shows an "Import More Spanish Voices" button in the VoiceSelector when the Spanish language filter is active

### Files to modify

| File | Change |
|------|--------|
| `src/hooks/useRetellVoices.ts` | Fix `deriveLanguage` to handle "mexican", "latin", and voice_id-based detection |
| `supabase/functions/import-retell-voice/index.ts` | **New** -- backend function to call Retell's add-community-voice API |
| `src/components/VoiceSelector.tsx` | Add "Import More Voices" button when filtered to Spanish (or any non-English language) |
| `supabase/config.toml` | Register the new edge function |

### Technical Details

**Language detection fix:**
```
deriveLanguage(accent, name, voiceId):
  - "mexican" in accent --> spanish
  - "latin" in name/voiceId + "spanish" in name/voiceId --> spanish
  - "spanish" in accent/name/voiceId --> spanish
  - (existing rules for other languages)
```

**Import voice API call:**
```
POST https://api.retellai.com/add-community-voice
{
  "provider_voice_id": "<elevenlabs_voice_id>",
  "voice_name": "Voice Name",
  "voice_provider": "elevenlabs",
  "public_user_id": "<elevenlabs_user_id>"
}
```

**Curated Spanish ElevenLabs voices to pre-load:**
We will include a hardcoded list of well-known ElevenLabs Spanish voice IDs (male and female, various accents like Latin American, Castilian, Mexican) that users can import. After import, they appear in the regular voice list on next refresh.

**Import flow in UI:**
1. User selects "Spanish" language filter
2. Sees existing Spanish voices plus an "Import More Spanish Voices" panel at the bottom
3. Panel shows available community voices with preview and "Import" button
4. On click, calls the backend function which imports the voice into Retell
5. Voice list refreshes and the new voice appears

