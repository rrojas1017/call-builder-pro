

## Better Voice Filtering and Search

Right now the voice selector only has a text search box and an optional language dropdown. With dozens (or hundreds) of voices coming back from the API, that's not enough to find what you need quickly.

### What's Changing

**1. Gender Filter** -- Add a toggle row (All / Male / Female) so you can instantly narrow down the list by half. The Bland API returns gender info on most voices, so we'll extract and expose it.

**2. Accent / Style Tags** -- Add a second filter dropdown for accent or style (e.g. "American", "British", "Australian", "Narrative", "Conversational"). These are parsed from the voice description or tags returned by the API.

**3. "Currently Selected" Pinned at Top** -- The voice you already have selected will always appear at the very top of the list (outside the scroll area), so you never lose track of it.

**4. Smarter Search** -- The search box will also match against language, gender, and accent tags -- not just name and description.

**5. Increased Scroll Height** -- Bump the scrollable area from 320px to 420px so more voices are visible at once without scrolling.

### Technical Details

**`BlandVoice` interface** (in `useBlandVoices.ts`):
- Add `gender?: string` field, mapped from `v.gender` in the API response

**`VoiceSelector.tsx`**:
- Add `genderFilter` state (`"all" | "male" | "female"`) with a pill-style toggle row
- Pin the currently selected voice card above the scroll area
- Exclude the pinned voice from the main list to avoid duplication
- Expand `max-h-[320px]` to `max-h-[420px]`
- Update the filter logic to also match gender and include language/gender in search text

**No database changes required** -- this is purely a UI/hook update.
