

## Organize Voice Selection with Search and Scrollable List

### Problem
The voice list from Bland AI is very long, making it hard to find and compare voices. The current flat grid shows every voice at once, creating an overwhelming scroll experience.

### Solution
Add a search/filter bar, group custom clones separately, and constrain the voice list inside a scrollable container with a fixed max height.

### Changes

**1. Update `src/hooks/useBlandVoices.ts`**
- No changes needed -- the hook already provides `is_custom` flag for grouping

**2. Update voice selection in `src/pages/EditAgentPage.tsx`**
- Add a search `Input` at the top of the Voice section that filters voices by name/description
- Show custom clones in a separate "Your Clones" group above the general "Preset Voices" group
- Wrap the voice grid inside a `ScrollArea` with `max-h-[320px]` so the list doesn't take over the page
- Show a count like "Showing 12 of 48 voices"

**3. Update voice selection in `src/pages/CreateAgentPage.tsx`**
- Apply the same search + scroll + grouping treatment for consistency

### What Users Will See
- A search box at the top of the voice section ("Search voices...")
- Custom clones grouped first under a "Your Clones" label (if any exist)
- Preset voices grouped below under a "Preset Voices" label
- The entire list scrollable within a fixed-height container (~320px)
- A voice count indicator showing filtered results
- The selected voice remains highlighted and visible

### Files to Modify
- `src/pages/EditAgentPage.tsx` -- add search, grouping, scroll area
- `src/pages/CreateAgentPage.tsx` -- same treatment

