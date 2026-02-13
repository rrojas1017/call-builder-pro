

## Add Name Confirmation Without Disrupting the Screening Flow

### Problem
The agent greets the caller by their first name (from the contact list) but never actually confirms or asks for their name during the call. If the name on file is wrong or missing, the agent just skips it entirely. At the same time, asking for a name right at the start ("Can I get your name?") would feel like a survey and throw off the natural flow before consent and screening even begin.

### Solution
Add a **name confirmation step** placed strategically AFTER consent but BEFORE diving into state/zip/age questions. This way:
- The agent gets consent first (required for compliance)
- Then naturally confirms: "And just so I have it right, can I confirm your name?"
- Then flows into the screening questions seamlessly

This mirrors how real people handle calls -- they greet you, get permission to talk, then confirm who they're speaking with.

### Changes

**1. `src/lib/buildTaskPrompt.ts`**
- Add `confirm_name` as the second field in `baseFields` (right after `consent`)
- New field order: `consent` -> `confirm_name` -> `state` -> `zip_code` -> `age` -> ...
- Add label in `formatField`: "And just so I have it right, can I confirm your full name?" 
- Add `confirm_name` to the JSON summary fields

**2. `supabase/functions/run-test-run/index.ts`**
- The `run-test-run` function builds its own prompt with a separate field list for health agents
- Add `confirm_name` instruction after the consent field in the health agent prompt section
- Add zip code validation note (already present but confirm it includes name)

**3. `supabase/functions/tick-campaign/index.ts`**
- No structural changes needed since it calls `buildTaskPrompt()` which will pick up the new field automatically
- The `summary_prompt` on line 205 should be updated to include `confirm_name` / `caller_name` in the JSON output

### Field Placement Logic

```
1. Consent (required first -- compliance)
2. Confirm name (natural transition -- "Great, and just to make sure I have your info right...")
3. State
4. Zip code
5. Age
6. Household size
7. Annual income
8. Coverage type
9. Qualifying life event (health agents only)
```

### Why This Order Works
- Consent must come first (compliance)
- Name confirmation feels natural right after consent -- like a real person double-checking their records
- It does NOT derail the screening because it's a quick, one-answer question before the heavier questions start
- The agent already said the caller's name in the greeting, so confirming it feels like a polite formality, not a cold survey question

### Files to Modify
- `src/lib/buildTaskPrompt.ts` -- add `confirm_name` field and label
- `supabase/functions/run-test-run/index.ts` -- add name confirmation to health agent fields
- `supabase/functions/tick-campaign/index.ts` -- update summary_prompt to capture caller name
