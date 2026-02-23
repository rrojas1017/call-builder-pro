
# Opening Line Name Mismatch Safeguard

## Problem
When a user sets `persona_name` to "Alex" but the `opening_line` still contains a hardcoded name like "Ashley", the agent introduces itself with the wrong name. There is no validation catching this mismatch.

## Solution
Add a two-layer safeguard:
1. **Auto-replace at save time** -- When saving agent settings, detect any hardcoded name in the opening line that does not match the persona name, and auto-replace it with the `{{agent_name}}` placeholder. Warn the user via toast that the replacement was made.
2. **Runtime safety net in `buildTaskPrompt`** -- Before injecting the opening line into the prompt, scan for common first names that do not match `persona_name` and replace them with the actual persona name.

## What Changes

### 1. Create a shared utility: `src/lib/openingLineGuard.ts`
A small function that:
- Takes `openingLine` and `personaName`
- Extracts the name pattern from common intro phrases like "this is [Name]", "my name is [Name]", "soy [Name]", "me llamo [Name]"
- If a hardcoded name is found and it does not match `personaName`, replaces it with `{{agent_name}}`
- Returns `{ corrected: string; wasFixed: boolean; oldName?: string }`

### 2. Modify `src/pages/EditAgentPage.tsx`
In `handleSave`, before writing to the database:
- Run the opening line through the guard
- If corrected, update the local state and show a toast: "Opening line updated: replaced 'Ashley' with your persona name placeholder"
- Save the corrected version

### 3. Modify `src/pages/CreateAgentPage.tsx`
Same logic in `handleSaveAgent` -- run the guard before saving the spec.

### 4. Modify `src/lib/buildTaskPrompt.ts` (runtime safety net)
After resolving `{{agent_name}}` placeholders, add a final scan: if the resolved opening line still contains a name-like pattern (e.g., "this is [SomeName]") where `SomeName` differs from `personaName`, replace it. This catches cases where the database was not cleaned up.

## Guard Function Logic
```text
function guardOpeningLine(openingLine: string, personaName: string):
  patterns = [
    /this is (\w+)/i,
    /my name is (\w+)/i,
    /I'm (\w+)/i,
    /soy (\w+)/i,
    /me llamo (\w+)/i,
    /mi nombre es (\w+)/i,
    /je suis (\w+)/i,
    /meu nome .+ (\w+)/i
  ]
  
  for each pattern:
    match = openingLine.match(pattern)
    if match and match[1] != personaName (case-insensitive):
      replace match[1] with {{agent_name}}
      return { corrected, wasFixed: true, oldName: match[1] }
  
  return { corrected: openingLine, wasFixed: false }
```

## Files to Create
- `src/lib/openingLineGuard.ts`

## Files to Modify
- `src/pages/EditAgentPage.tsx` -- Add guard call in `handleSave`
- `src/pages/CreateAgentPage.tsx` -- Add guard call in `handleSaveAgent`
- `src/lib/buildTaskPrompt.ts` -- Add runtime fallback after placeholder resolution
