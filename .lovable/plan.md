

# Make the verbatim script the spine of the call

## What's wrong today
When you paste a script into **Verbatim Script**, the system currently treats it as just one section of the prompt — labeled "HIGHEST PRIORITY," yes, but it still sits *alongside*:
- A generic RULES block ("vary sentence length", "one question per turn", "pause and acknowledge")
- The COLLECT list (must-collect fields injected automatically)
- The FPL table (for health agents)
- An OPENING GUIDE block (only suppressed if a script exists — good)
- A long BUSINESS RULES block at the end labeled "HIGHEST PRIORITY" too

Two things labeled "HIGHEST PRIORITY" cancel each other out. The model ends up balancing the script against generic pacing rules and the field-collection list, which is why your Hello Nation script gets diluted — the agent delivers the opening, then drops back into a generic interview cadence instead of "circling around" the script's intent.

## The fix — reorganize the prompt around the script

When `verbatim_script` is present, `buildTaskPrompt` switches to **Script-Anchored Mode**:

### 1. Script becomes the lead, not a side block
- The verbatim script is moved to the **top** of the prompt, immediately after PERSONA and CALLER blocks — before RULES, before PURPOSE, before COLLECT.
- New framing language: *"This call REVOLVES around the script below. Your job is to deliver it, then steer the conversation back to its goal whenever the caller drifts. Everything else in this prompt is supporting context for that script — not competing instructions."*

### 2. COLLECT list becomes "AFTER THE SCRIPT, gather:"
- Currently labeled `COLLECT (in order):` — sounds like an interview checklist that competes with the script.
- When a script exists, relabel to: *"AFTER you've delivered the script and the caller is engaged, weave these data points into the natural conversation flow (do NOT switch into interview mode):"*
- Stops the agent from abandoning the script's narrative to start firing field questions.

### 3. Suppress the generic pacing/RULES paragraph
- The current RULES block ("vary sentence length", "use casual transitions", "one question per turn") is generic and often contradicts a tightly-written script.
- In script-anchored mode, replace it with a tighter block:
  - Stay in the script's voice and rhythm
  - Acknowledge answers briefly, then return to the script's next beat
  - If the caller objects or asks something off-script, answer it, then bridge back: *"Anyway, as I was saying…"*

### 4. FPL/health blocks become reference, not directives
- Today the FPL table is injected as primary instructions for health agents.
- When a script is present, prepend it with: *"REFERENCE ONLY — use this data to answer questions if asked, but do NOT pivot the call into an FPL calculation unless the script asks you to."*

### 5. Single source of "HIGHEST PRIORITY"
- Remove the "HIGHEST PRIORITY" label from the BUSINESS RULES block when a script is present (business rules still get appended last, but framed as *"BUSINESS RULES — apply these while delivering the script, never in conflict with it"*).
- The script keeps the sole HIGHEST PRIORITY designation.

### 6. New explicit "circle back" instruction
- After the script body, append: *"CIRCLE-BACK BEHAVIOR: The caller will interrupt, ask questions, or go on tangents. Handle each one briefly and warmly, then ALWAYS bring the conversation back to the script's purpose: [auto-derived from `success_definition` or first sentence of script]. The call is not over until either (a) the script's goal is achieved, or (b) the caller clearly declines."*

## Files changed

- `supabase/functions/_shared/buildTaskPrompt.ts` — branch the entire prompt assembly when `rawVerbatim` is non-empty: reorder sections, swap RULES block, relabel COLLECT, demote FPL, demote business-rules priority label, append circle-back footer

That's the only file. No DB changes, no UI changes, no edge function call-site changes — every existing caller (`run-test-run`, `start-campaign`, `retell-llm-ws`, `apply-audit-recommendation`, simulations) automatically picks up the new behavior because they all flow through `buildTaskPrompt`.

## What I'm NOT changing

- Agents WITHOUT a verbatim script keep the exact prompt structure they have today — zero regression risk
- The script's word-for-word delivery instruction stays
- Retell's `begin_message` source-switch (script over opening_line) already works — no change there
- `must_collect_fields` UI — admins can still configure them; they just get framed differently when a script is in play
- Business rules content — still injected, just with friendlier framing relative to the script

## Expected outcome on your Hello Nation agent

- "Matt" delivers the full Asheville/U.S. Conference of Mayors intro verbatim
- After the close ("Would you be open to a quick chat this afternoon or tomorrow morning?"), Matt stays in *that* conversation — booking the meeting, handling objections, looping back to the "final three candidates" framing
- He doesn't suddenly pivot to *"Can I get your zip code?"* or start an FPL conversation
- If the caller goes off-topic, Matt answers briefly and bridges back to the script's purpose

