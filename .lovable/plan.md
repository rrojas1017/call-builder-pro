
# Fix Agent Redundancy: Eliminate Double Name Request and Double Disclosure

## Root Cause Analysis

The session replay reveals three specific sources of redundancy in the AliviaLabs Spanish agent:

**Redundancy #1 — Name asked twice:**
- The `opening_line` template already asks: *"¿Podría confirmar su nombre completo, por favor?"*
- Then `buildTaskPrompt` auto-injects `"Can I confirm your full name?"` into `must_collect_fields` right after consent
- Result: agent asks for name in the opening → user says "sí" to consent → agent asks for name **again**

**Redundancy #2 — Disclosure read twice:**
- The agent naturally mentioned the recording disclosure during its opening
- The prompt has `DISCLOSURE (read at start): "..."` which triggers the agent to **re-read** the disclosure text again after consent
- Result: "Esta llamada está siendo grabada para fines de calidad." appears **twice** in the conversation

**Redundancy #3 — Re-introduction after consent:**
- After getting consent, the agent said "Soy un asesor de bienestar de Alivia Labs" — re-introducing itself unnecessarily because the prompt structure doesn't tell it that the introduction already happened in the opening

---

## The Fixes

### Fix 1: Remove auto-injected name field when opening_line already asks for name

In `supabase/functions/_shared/buildTaskPrompt.ts`, the auto-injection logic at lines 97-105 currently **always** adds a name confirmation step. This needs to be suppressed when the `opening_line` already contains a name request.

**Change**: Skip the name injection entirely when the `opening_line` contains `{{first_name}}` OR contains common name-ask patterns (the opening is already asking for the caller by name). Since the opening line serves as the opener that naturally collects the name, we don't need it again in the collect sequence.

A cleaner approach: instead of injecting a full question, simply add a note in the COLLECT section: *"(Name should already be known from opening — confirm naturally if still unclear, do not re-ask)"*.

### Fix 2: Change DISCLOSURE from "read at start" to "mention once, conversationally"

The current instruction `DISCLOSURE (read at start): "..."` causes the agent to read this as a formal announcement even after it already came up naturally in conversation.

**Change**: Reword the disclosure instruction to make it clear it should be woven into the opening naturally, not re-read as a formal block:

```
DISCLOSURE (mention once, naturally during opening — do NOT repeat): "[text]"
```

This prevents the agent from reciting the disclosure again after already mentioning it.

### Fix 3: Add an "already-said" awareness rule to the RULES block

Add a clear rule that prevents the agent from re-introducing itself or re-asking anything already covered in the opening exchange:

```
- NEVER re-introduce yourself or re-state company name after the opening — it was already said.
- NEVER re-ask for information the caller already provided earlier in the call.
- If you already mentioned the recording disclosure in your opening, do NOT repeat it.
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/buildTaskPrompt.ts` | (1) Replace hard-injected name question with a soft note; (2) Change `DISCLOSURE (read at start)` to `DISCLOSURE (mention once during opening, do NOT repeat)`; (3) Add anti-redundancy rules to the RULES block |
| `src/lib/buildTaskPrompt.ts` | Mirror the same three changes (client-side copy used for prompt preview) |

---

## What the Agent Will Do Differently After This Fix

**Before:**
1. "Hola, mi nombre es María... ¿Podría confirmar su nombre completo?" ← opening asks name
2. User: "Sí"
3. "Esta llamada está siendo grabada..." ← disclosure re-read
4. "¿Me podrías decir tu nombre completo para empezar?" ← name asked AGAIN

**After:**
1. "Hola {{first_name}}, mi nombre es {{agent_name}} y le llamo de parte de Alivia Labs. Esta llamada se grabará para calidad — ¿tiene un momento?" ← single natural opening with name + disclosure woven in
2. User: "Sí, soy Ramón Rojas"
3. "Perfecto, Ramón. ¿Cuál es su malestar principal?" ← moves straight to collecting data

The fix is purely in the prompt — no database changes, no schema changes, no UI changes needed. Both copies of `buildTaskPrompt` (shared edge function version and client-side preview version) will be updated to stay in sync.
