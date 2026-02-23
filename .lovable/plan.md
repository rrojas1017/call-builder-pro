

# Add Language Filter to Voice Selector

## Problem
The Retell API doesn't return a `language` field for voices -- it only returns `accent` (e.g., "American", "British", "Brazilian"). The `useRetellVoices` hook tries to map `v.language` but it's always undefined, so the language filter in VoiceSelector never appears (it's hidden when there are fewer than 2 languages).

## Solution
Derive language from the voice data (accent + voice name) in the `useRetellVoices` hook, so the language filter populates automatically.

### Language Mapping Logic
Based on the actual Retell API data:
- Accent "American" or "British" or "Australian" = **English**
- Accent "Brazilian" or name containing "Portugese" = **Portuguese**  
- Accent "Spanish" or name containing "Spanish" = **Spanish**
- Accent "French" or name containing "French" = **French**
- Accent "German" or name containing "German" = **German**
- Accent "Italian" or name containing "Italian" = **Italian**
- Fallback: **English**

### Files to Modify

**1. `src/hooks/useRetellVoices.ts`**
- Add a `deriveLanguage(accent, name)` helper function that maps accent/name to a language string
- Use it when mapping voice data: `language: deriveLanguage(v.accent, v.voice_name ?? v.name)`

**2. `src/pages/EditAgentPage.tsx`**
- Pass `defaultLanguageFilter` to VoiceSelector based on the agent's configured language, so the filter starts pre-set to the relevant language

No changes needed to VoiceSelector itself -- it already handles the language filter display when languages are available.
