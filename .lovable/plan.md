
# Fix: Name Handling — Use Caller Name When Available, Ask When Not

## The Real Problem

There are two separate issues causing the bad name behavior:

### Issue 1 — OPENING GUIDE shows "[caller's name]" literally

In `buildTaskPrompt`, line 159:
```
const filledGuide = resolvedOpeningLine.replace(/\{\{first_name\}\}/gi, "[caller's name]");
```

This replaces the `{{first_name}}` placeholder with the literal text `[caller's name]` inside the prompt. The AI sometimes reads this verbatim or gets confused. The fix: the `OPENING GUIDE` section should tell the agent what to do based on whether a name is known or not — but `buildTaskPrompt` doesn't know the contact's actual name at build time.

### Issue 2 — No explicit name awareness instruction in the prompt

The prompt gives no instruction like:
- "The caller's name is Ramón Rojas — use it naturally"
- OR: "You do NOT have this person's name — ask for it early in the conversation"

The agent is left guessing. This is why sometimes it ignores the name, sometimes asks anyway even when it knows it.

### Issue 3 — `first_sentence` in Bland is the actual opening the agent speaks

In `run-test-run`, line 186:
```
const contactFirstSentence = rawFirstSentence ? replaceTemplateVars(rawFirstSentence, contact, spec?.persona_name) : undefined;
```

This correctly resolves `{{first_name}}` in the `first_sentence` field. BUT — if `contact.name` is empty, `{{first_name}}` resolves to an empty string, so the agent says "¡Hola !" (blank greeting). There's no fallback to ask for the name.

---

## The Fix

### Fix 1 — Pass caller name context into `buildTaskPrompt`

Add an optional `callerName` parameter to `buildTaskPrompt`. When present, inject a `CALLER` section at the top of the prompt:

```
CALLER: The person you are calling is [Ramón Rojas]. Use their name naturally during the call.
```

When absent (name is empty), inject instead:
```
CALLER: You do NOT have this person's name yet. Ask for their name early and naturally — do NOT skip this.
```

This gives the AI explicit, unambiguous instructions.

### Fix 2 — Remove the confusing "[caller's name]" literal from the OPENING GUIDE

Instead of replacing `{{first_name}}` with `[caller's name]` (which the AI sometimes reads out loud), replace it with either the actual name (if known) or the instruction `(caller's name — ask if unknown)`.

### Fix 3 — Fix the `first_sentence` blank name fallback

In both `run-test-run` and `tick-campaign`, when resolving the `first_sentence`, if the contact name is empty, fall back to a neutral opening that naturally flows into asking for the name:

```
// If no name, use a neutral opening
const firstName = contact.name?.trim().split(/\s+/)[0] || "";
const contactFirstSentence = firstName 
  ? replaceTemplateVars(rawFirstSentence, contact, spec?.persona_name)
  : rawFirstSentence.replace(/\{\{first_name\}\}[,!]?\s*/gi, "").trim() + " ¿Con quién tengo el gusto?";
```

This way the agent never opens with "¡Hola !" when the name is missing.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/buildTaskPrompt.ts` | Add optional `callerName` param; inject CALLER section; fix OPENING GUIDE placeholder |
| `supabase/functions/run-test-run/index.ts` | Pass `contact.name` to `buildTaskPrompt`; fix blank-name `first_sentence` fallback |
| `supabase/functions/tick-campaign/index.ts` | Same blank-name `first_sentence` fallback fix |
| `src/lib/buildTaskPrompt.ts` | Mirror the `buildTaskPrompt` signature change for client-side preview |

---

## What the Agent Will Do After This Fix

**When contact name IS provided (e.g. "Ramón Rojas"):**
- Prompt contains: `CALLER: The person you are calling is Ramón Rojas. Use their name naturally.`
- First sentence: `¡Hola Ramón! Soy María de Alivia Labs...`
- Agent greets by name, uses it throughout — never asks for it again

**When contact name is NOT provided (blank):**
- Prompt contains: `CALLER: You do NOT have this person's name yet. Ask for it early and naturally.`
- First sentence: `¡Hola! Soy María de Alivia Labs... ¿Con quién tengo el gusto?`
- Agent opens neutrally and asks for the name on the first turn — exactly as expected
