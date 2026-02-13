

## Fix Agent Introduction, Add Zip Code Validation, and Smooth Transfer Message

### Problem 1: Agent Sounds Like an Automated System
The opening line and prompt framing sound robotic. The `tick-campaign` edge function hardcodes a stiff first sentence: "this is a quick call about health coverage options you requested information about." The prompt also labels the agent as an "ACA pre-qualification screening agent" which leaks into how it talks.

### Problem 2: No Zip Code Collection or Validation
The agent currently only asks for state. Adding a zip code question allows more precise location data and can be cross-validated (5-digit US zip format). This also gets passed along with the transfer for the licensed agent.

### Problem 3: Transfer Message Breaks Up
The qualified transfer line -- "Great news! Based on what you've told me, you may qualify for assistance. Let me connect you with a licensed agent who can help." -- is too long and wordy, causing audio breakup when spoken. Needs to be split into shorter, natural sentences.

---

### Changes

**1. `src/lib/buildTaskPrompt.ts`**
- Change the agent self-description from "ACA pre-qualification screening agent" to something natural like: "You are a friendly, knowledgeable health benefits advisor having a natural phone conversation."
- Add `zip_code` to the base health fields (after `state`)
- Add a zip code label in `formatField`: "What's your zip code?" with a validation note instructing the agent to confirm it's 5 digits
- Replace the long transfer confirmation with two short sentences: "That's great news -- it looks like you may qualify for some help with your coverage. Let me get you over to a licensed agent right now."
- Add a prompt instruction: "When transferring, keep your message SHORT. Say one brief sentence, then transfer. Do not give a long speech before transferring."

**2. `supabase/functions/tick-campaign/index.ts`**
- Replace the hardcoded `first_sentence` with a warmer, human opening: "Hey {{first_name}}, it's [agent name] -- I'm following up on the health coverage info you asked about. Got a quick minute?"
- Use the spec's `opening_line` if available, falling back to the warmer default
- Add template variable replacement for the first sentence (reuse `replaceTemplateVars` pattern from run-test-run)
- Add `zip_code` to the field labels
- Update the transfer confirmation message to be shorter
- Update the prompt intro to avoid "automated system" language

**3. `supabase/functions/run-test-run/index.ts`**
- Add `zip_code` to the default field set for health agents (already uses `spec.opening_line` so intro is fine)
- Update any hardcoded qualification messages to use shorter transfer wording
- Add zip code validation instruction in the prompt

**4. `src/lib/fplThresholds.ts`**
- No changes needed (SEP/FPL sections stay as-is)

### Key Prompt Wording Changes

**Opening (tick-campaign default):**
- Before: "Hi [name], this is a quick call about health coverage options you requested information about. Do you have a moment?"
- After: "Hey [name], this is just a quick follow-up on the health coverage info you were looking into. Got a sec?"

**Agent identity:**
- Before: "You are a professional ACA pre-qualification screening agent"
- After: "You are a friendly, knowledgeable health benefits advisor" (in buildTaskPrompt.ts); run-test-run already uses "You are a REAL PERSON making a phone call"

**Transfer message:**
- Before: "Great news! Based on what you've told me, you may qualify for assistance. Let me connect you with a licensed agent who can help."
- After: "That sounds really promising -- I think you'd qualify for some help here. Let me connect you with someone who can walk you through the details."
- Add instruction: "Keep your transfer announcement to ONE short sentence. Do not monologue before transferring."

**Zip code field:**
- New field `zip_code` added after `state` with label: "And what's your zip code?" (agent instructed to confirm it's exactly 5 digits)

### Files to Modify
- `src/lib/buildTaskPrompt.ts` -- humanize intro, add zip_code field, shorten transfer message
- `supabase/functions/tick-campaign/index.ts` -- warm up first_sentence, add zip_code, shorten transfer, template vars
- `supabase/functions/run-test-run/index.ts` -- add zip_code to health fields

