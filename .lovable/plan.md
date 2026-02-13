

## Fix Voice Filtering and Selected Voice Display

Two bugs are causing the issues you see:

### Problem 1: Gender filter shows 0 results
The Bland API does not return a separate `gender` field. Instead, gender is embedded in the voice description (e.g., "American Male", "Casual American Female"). The current code tries to read `v.gender` which doesn't exist, so every voice has `undefined` gender and no filter ever matches.

### Problem 2: Your chosen voice ("maya") doesn't appear
The agent has `voice_id` stored as `"maya"` (the name), but the API returns UUIDs like `"2f9fdbc7-..."` as the voice ID. Since the selector looks for a voice where `voice_id === "maya"`, it finds nothing.

---

### Fixes

**`src/hooks/useBlandVoices.ts`**
- Parse gender from the `description` field using simple keyword matching: if description contains "female" -> female, "male" -> male
- Parse accent the same way from description (e.g., "British", "American", "Australian")
- Match voices by both `id` AND `name` so that stored name-based IDs like "maya" still resolve

**`src/components/VoiceSelector.tsx`**
- Update the pinned voice lookup to also match by `name` (case-insensitive), not just `voice_id`
- Same for the "selected" highlight in the main list

### Technical Details

In `useBlandVoices.ts`, the mapping will change to:

```text
gender:  extract from description ("Male"/"Female" keywords)
accent:  extract from description ("American"/"British"/etc.)
```

In `VoiceSelector.tsx`, voice matching will use:

```text
voice_id === selectedVoice OR name === selectedVoice (case-insensitive)
```

No database or backend changes needed.
