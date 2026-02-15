

## Fix: Pinned Voice Should Respect Active Filters

### Problem
When a filter is active (e.g., "Male"), the currently selected voice (Maya, which is female) still appears pinned at the top under the "Selected" heading. This is confusing because it contradicts the active filter.

### Solution
Hide the pinned "Selected" voice when it does not match the active filters.

### Changes

**File: `src/components/VoiceSelector.tsx`**

Update the `pinnedVoice` logic (around line 46) to also check whether the selected voice passes the current gender, language, and accent filters. If it doesn't match, `pinnedVoice` will be `undefined` and won't render.

Specifically:
1. Change the `pinnedVoice` memo to apply the same filter conditions used for the main list.
2. If `genderFilter` is not "all" and the pinned voice's gender doesn't match, exclude it.
3. Same for `languageFilter` and `accentFilter`.
4. Update the memo's dependency array to include `genderFilter`, `languageFilter`, and `accentFilter`.

### Technical Detail

```typescript
const pinnedVoice = useMemo(() => {
  if (!selectedVoice) return undefined;
  const match = voices.find(matchesSelected);
  if (!match) return undefined;
  // Respect active filters
  if (genderFilter !== "all" && match.gender !== genderFilter) return undefined;
  if (languageFilter !== "all" && match.language?.toLowerCase() !== languageFilter.toLowerCase()) return undefined;
  if (accentFilter !== "all" && match.accent?.toLowerCase() !== accentFilter.toLowerCase()) return undefined;
  return match;
}, [voices, selectedVoice, genderFilter, languageFilter, accentFilter]);
```

No other files need changes. The voice count display already accounts for `pinnedVoice` being undefined, so it will adjust automatically.

