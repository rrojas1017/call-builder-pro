
# Agent Persona Name + Dynamic Natural Greeting

## What's Wrong Right Now

The `opening_line` field is treated as a verbatim script that gets read word-for-word. The Bland AI `first_sentence` parameter is populated directly from this stored string. This means:

- The agent reads "Hi, I'm calling on behalf of our team…" exactly as typed — robotic and scripted.
- There is no agent persona name (like "Sofia" or "Carlos") — the agent has no identity to introduce itself with.
- The agent never naturally says its own name OR asks for the caller's name in the opening greeting.
- For Spanish agents: `"Hola, mi nombre es [nombre] y le llamo de parte de [empresa]"` is impossible because there's no `[nombre]` to fill in.

## The Fix — Three Connected Changes

### 1. Add `persona_name` field to `agent_specs` (database migration)
A new `persona_name` text column (nullable) on `agent_specs`. This is the human name the agent introduces itself as — e.g. "Sofia", "Carlos", "Alex". It is separate from the agent project name (which is an internal label like "Health Insurance Pre-Qualifier").

### 2. Add "Agent Persona Name" input to wizard + Edit Agent page

**In `CreateAgentPage.tsx` — Step 0:**
Add a "Your agent's name" input field right after "Agent Name" (the internal label). A short hint: *"This is the name your agent will introduce itself as on the call — e.g. Sofia, Alex, Carlos."*

**In `EditAgentPage.tsx`:**
Add the same `persona_name` field so it can be changed after creation.

**Translations** in `TRANSLATIONS` map for all 6 languages.

### 3. Rewrite `opening_line` from static script to dynamic template + update `buildTaskPrompt`

**`generate-spec/index.ts`** — change the AI system prompt to instruct:
- `opening_line` must be a **natural-sounding template** (not verbatim), using the placeholder `{{agent_name}}` for the agent's self-introduction and `{{first_name}}` for the caller's name.
- Example English: `"Hey {{first_name}}, this is {{agent_name}} calling on behalf of [Company] — you got a quick second?"`
- Example Spanish: `"Hola {{first_name}}, mi nombre es {{agent_name}} y le llamo de parte de [Empresa] — ¿tiene un momento?"`
- The `opening_line` is a **starting point template**, not a word-for-word read.

**`_shared/buildTaskPrompt.ts`** (and the copy in `src/lib/buildTaskPrompt.ts`) — update `buildTaskPrompt` to:
- Add a new `persona_name` field to the `AgentSpec` interface.
- Inject into the prompt a `PERSONA` section:
  ```
  PERSONA: Your name is {{agent_name}}. When you introduce yourself, always use this name naturally. Do NOT say you are AI, a bot, or automated.
  ```
- Replace `{{agent_name}}` in the `opening_line` with the actual `persona_name` before building the prompt (just like `replaceTemplateVars` already does for `{{first_name}}`).
- Add explicit instructions that the **opening is a natural guide, not a script** — the agent should ask for the caller's name early if it doesn't already know it, not read the opening_line verbatim.

**`run-test-run/index.ts` and `tick-campaign/index.ts`** — wherever `spec.opening_line` is passed to Bland as `first_sentence`, also substitute `{{agent_name}}` with `spec.persona_name` before sending.

**`replaceTemplateVars`** — extend to also replace `{{agent_name}}` with the persona name.

### 4. Update the `generate-spec` fallback defaults
The hardcoded fallback `opening_line` becomes a template:
- English: `"Hey {{first_name}}, this is {{agent_name}} calling — do you have a quick moment?"`
- Spanish: `"Hola {{first_name}}, mi nombre es {{agent_name}} y le llamo para ayudarle — ¿tiene un minuto?"`

---

## Files Changed

| File | Change |
|------|--------|
| Database migration | Add `persona_name TEXT` column to `agent_specs` |
| `supabase/functions/generate-spec/index.ts` | Instruct AI to generate `opening_line` as a natural template with `{{agent_name}}` and `{{first_name}}` placeholders; update fallback defaults |
| `supabase/functions/_shared/buildTaskPrompt.ts` | Add `persona_name` to `AgentSpec` interface; inject `PERSONA` section into prompt; substitute `{{agent_name}}` in opening_line; clarify opening is a guide not a script |
| `src/lib/buildTaskPrompt.ts` | Same as above (client-side copy) |
| `supabase/functions/run-test-run/index.ts` | Substitute `{{agent_name}}` in `first_sentence` before sending to Bland |
| `supabase/functions/tick-campaign/index.ts` | Same — substitute `{{agent_name}}` before Bland call |
| `src/pages/CreateAgentPage.tsx` | Add `personaName` state + input field in Step 0 with translations; pass to `agent_specs` on save |
| `src/pages/EditAgentPage.tsx` | Add `personaName` field + save it |

---

## How the Opening Line Works After This Change

The `opening_line` stored in the database is now a **template with intent**, not a teleprompter script. For example:

**English template:**
> `"Hey {{first_name}}, this is {{agent_name}} calling on behalf of Alivia Labs — you got a quick second?"`

**What actually gets sent to Bland (after substitution):**
> `"Hey Maria, this is Sofia calling on behalf of Alivia Labs — you got a quick second?"`

And in the `buildTaskPrompt`, the prompt now also says:
```
PERSONA: Your name is Sofia. Introduce yourself naturally by name. Do not say you are AI, automated, or a robot.
OPENING GUIDE: Start with something like the opening below, but adapt it naturally — do not read it word-for-word as a script. Ask the caller's name early if you don't already know it.
Opening guide: "Hey {{first_name}}, this is Sofia calling on behalf of Alivia Labs..."
```

This ensures:
- The agent knows its own name and uses it
- The agent introduces itself naturally (not robotically)
- The agent can ask "Can I get your name?" if the contact name is unknown
- Spanish agents say "Hola, mi nombre es Sofia y le llamo de parte de Alivia Labs"
- The voice preview in Step 3 uses the actual persona name filled in (if provided)
