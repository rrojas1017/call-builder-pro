

## Fix Voice Filtering: Use API Tags + Expand Accent Detection

### Root Cause

The current `useBlandVoices.ts` hook only parses gender and accent from the `description` text using simple keyword matching. This fails in two ways:

1. **Only 3 accents detected** (american, british, australian) -- but the API has 10+ nationalities (indian, french, german, dutch, brazilian-portuguese, italian, spanish, etc.). Voices with unrecognized accents get `accent: undefined` and become invisible to the filter.

2. **Tags are ignored** -- The Bland API returns a `tags` array per voice (e.g., `["english", "male", "cloned"]`, `["french", "cloned"]`, `["German"]`) that contains reliable gender and language/accent data. The current code doesn't use it at all.

3. **Voices without clear descriptions are unclassified** -- e.g., "Sal" with description "An effective and simple voice" but tag `"male"` gets no gender assigned.

### Solution

Update `src/hooks/useBlandVoices.ts` to:

1. **Check `tags` first for gender** -- if tags contain `"male"` or `"female"`, use that. Fall back to description parsing only if tags don't have it.

2. **Expand accent detection to all nationalities in the API** -- parse from description: american, british, australian, indian, french, german, dutch, italian, spanish, brazilian-portuguese. Also check tags for these keywords.

3. **Extract language from tags** -- tags like `"english"`, `"french"`, `"spanish"`, `"German"`, `"italian"` map directly to language.

Update `src/components/VoiceSelector.tsx` to:

4. **Show accent badges on each voice card** so users can visually confirm what they're getting.

5. **Show "Unknown" counts** -- when filters are active, display how many voices were excluded due to missing metadata, so the user understands why the list seems limited.

### Technical Details

| File | Change |
|---|---|
| `src/hooks/useBlandVoices.ts` | Rewrite metadata extraction: check `tags` array for gender/language, expand accent keyword list from 3 to 10+, combine tags + description for best-effort classification |
| `src/components/VoiceSelector.tsx` | Add language badge to voice cards, show excluded-count note when filters reduce results significantly |

No backend changes. No new files. No new dependencies.

### Accent Keyword Map (New)

```text
Description keyword    ->  Accent value
american               ->  american
british                ->  british
australian             ->  australian
indian                 ->  indian
french                 ->  french
german                 ->  german
dutch                  ->  dutch
italian                ->  italian
spanish                ->  spanish
brazilian-portuguese   ->  brazilian
brazilian              ->  brazilian
portuguese             ->  portuguese
```

### Gender Detection Priority (New)

1. Check `tags` array for exact `"male"` or `"female"` string (case-insensitive)
2. If not found, fall back to description keyword matching (current logic, which correctly checks "female" before "male")
3. If neither works, `gender` stays `undefined` and voice is excluded when gender filter is active (correct behavior)

