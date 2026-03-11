

# Fix: Opening Line Guard Is Self-Contradicting

## Problem

The `guardOpeningLine` function has two sequential steps that fight each other:

1. **Duplicate `{{agent_name}}` removal** — removes the second placeholder, creating text like `"Hi, this {{agent_name}} and I'm today because..."` (the word after "I'm" is now exposed)
2. **Name mismatch scanner** — pattern `\bI'm (\w+)\b` then captures `"today"` as a "name", decides it doesn't match the persona, and replaces it with `{{agent_name}}` — **re-introducing the duplicate** it just removed

This creates a loop where the guard mangles the line. Additionally, even without duplicates, the patterns are too aggressive — `\bI'm (\w+)\b` matches ANY word after "I'm", not just names (e.g. "I'm calling", "I'm reaching out").

There's also the broader issue the user raised: the guard **should not be auto-correcting on save at all** without the user's approval. It silently rewrites their opening line.

## Fix

### 1. `src/lib/openingLineGuard.ts` — Stop running name-mismatch scan after duplicate removal

After removing duplicate placeholders, **skip the name-mismatch scan entirely** — the line is already using `{{agent_name}}` and further pattern matching on the cleaned-up text produces garbage results.

Additionally, add a **skip-word list** to the intro patterns so common non-name words like "calling", "reaching", "today", "here" are never treated as names.

### 2. `src/pages/EditAgentPage.tsx` — Don't silently rewrite, warn instead

Instead of auto-correcting the opening line on save, only **warn** the user via toast if a potential name mismatch is detected, but **save what the user typed**. The guard becomes advisory, not destructive.

### 3. `src/pages/CreateAgentPage.tsx` — Same change as above

Same advisory-only behavior during agent creation.

| File | Change |
|------|--------|
| `src/lib/openingLineGuard.ts` | Skip name scan after duplicate fix; add non-name skip list |
| `src/pages/EditAgentPage.tsx` | Save user's text as-is; show warning toast instead of auto-rewrite |
| `src/pages/CreateAgentPage.tsx` | Same advisory-only change |

