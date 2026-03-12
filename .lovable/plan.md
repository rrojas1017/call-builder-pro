

# Fix: Opening Line Name Injection & Post-Opening Pause

## Issue 1: "I am" falsely triggers name replacement

**Root cause found.** The backend function `runtimeGuardResolvedLine` in `supabase/functions/_shared/buildTaskPrompt.ts` has **no skip-words list**. When the opening line resolves to e.g. "Hi, this is Sarah. I am calling today...", the pattern `/\bI am (\w+)/i` captures "calling", sees it doesn't match "Sarah", and replaces it with the persona name — producing "I am Sarah calling today..."

This corrupted `begin_message` is what gets pushed to Retell on save/campaign-start/test-run.

The client-side `runtimeGuardOpeningLine` in `src/lib/openingLineGuard.ts` has the same bug (has SKIP_WORDS in `guardOpeningLine` but not in `runtimeGuardOpeningLine`).

**Fix — 2 files:**

1. **`supabase/functions/_shared/buildTaskPrompt.ts`** — Add the same SKIP_WORDS set to `runtimeGuardResolvedLine` so common verbs/adverbs after "I am", "this is", etc. are not mistaken for names.

2. **`src/lib/openingLineGuard.ts`** — Add SKIP_WORDS check to `runtimeGuardOpeningLine` (the runtime function), matching what `guardOpeningLine` already does.

## Issue 2: Bot pauses after opening line instead of proceeding

**Root cause.** The prompt's OPENING GUIDE section tells the agent to "start with something like the line below" but gives no instruction about what to do immediately after. Combined with the PACING rule ("do NOT rapid-fire"), the LLM interprets this as "wait for the caller to respond before continuing."

For outbound use cases (especially new movers, ACA, etc.), the agent should flow directly from the opening into the first mandatory field or qualifying question without an awkward pause.

**Fix — 2 files:**

1. **`supabase/functions/_shared/buildTaskPrompt.ts`** — After the OPENING GUIDE line, add an explicit instruction: "After delivering the opening, proceed directly into your first question or field collection — do NOT pause and wait for a response unless your opening line ends with a question."

2. **`src/lib/buildTaskPrompt.ts`** — Same change (client-side copy of prompt builder).

