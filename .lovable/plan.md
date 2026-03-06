

# Fix ACA Agent Opening Line — Break Monologue Into Conversational Beats

## Problem
The current opening line is a single block that the agent delivers all at once:

> "Hi there, this is Alex with the ACA Savings Center. This call is recorded for quality and training purposes. Do you consent to this call being recorded? I'm reaching out because you recently asked about health insurance options—do you have a quick minute to see if you qualify for some marketplace savings? And just so I can address you properly, may I have your name?"

That is 4 distinct asks crammed into one breath — intro, disclosure, consent, reason for call, AND name request. The caller has no natural pause point to respond, so the agent steamrolls through everything.

## Fix
Update the `opening_line` in `agent_specs` for this project to contain ONLY the first conversational beat — the intro + consent question. Everything else (reason for calling, name) should be handled naturally by the prompt flow after the caller responds.

**New opening line:**
> "Hi there, this is Alex with the ACA Savings Center. This call is recorded for quality and training purposes — do you consent to this call being recorded?"

That's it. Short, one question, then WAIT. The prompt's `COLLECT` fields and `PACING` rules already instruct the agent to ask for name, reason for call, etc. after each response.

## Additional Prompt Reinforcement
Add a line to the `buildTaskPrompt` function's RULES section to explicitly instruct: **"After your opening line, STOP and wait for the caller to respond before saying anything else. Never stack multiple questions or topics in one turn."**

## Changes

1. **Database update** — Update `agent_specs.opening_line` for project `66138346-0a1f-4c5f-b30b-fab52f15d3a3` to the shorter version.

2. **`src/lib/buildTaskPrompt.ts`** — Add a "one question per turn" rule to the RULES section so this applies to ALL agents, not just this one. Add after the PACING rule:
   ```
   - ONE QUESTION PER TURN: Never ask more than one question in a single response. 
     Ask one thing, then STOP and wait for the caller to answer before continuing.
   ```

3. **`supabase/functions/_shared/buildTaskPrompt.ts`** — Same change (edge function copy).

