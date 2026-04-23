

# Stop asking for the name when we already have it

## What's wrong today

When you launch a campaign or test run, every contact has a name (it came from your uploaded list). Retell already passes that name into the system prompt at call time as `{{first_name}}` and `{{contact_name}}`. But the prompt builder doesn't take advantage of it for real outbound calls:

1. **`run-test-run`, `start-campaign`, `retell-llm-ws`** all call `buildTaskPrompt(spec, …, "")` — passing an **empty** `callerName`. The prompt then says *"You do NOT have this person's name yet. Ask for their name early…"* even though we do have it.
2. The "Can I confirm your full name?" field gets injected into the COLLECT list whenever `must_collect_fields` doesn't already mention name — regardless of whether we actually have the name.
3. Net effect: agent re-asks for the name the moment the caller picks up, wasting the first 30 seconds of every call and ignoring data you already uploaded.

(Simulations are unaffected — they pass a randomized caller name and already work correctly.)

## The fix

### 1. Use Retell dynamic variables in the prompt

Instead of asking the prompt builder to bake a literal name into the text (impossible — the same prompt is shared across all contacts in a campaign), reference the variables Retell already substitutes at call time:

- New mode in `buildTaskPrompt`: when a new flag `useDynamicCallerName: true` is passed (used by `run-test-run`, `start-campaign`, `retell-llm-ws`), the CALLER block becomes:

  > *CALLER: The person you are calling is {{contact_name}} (first name: {{first_name}}). Use their first name naturally during the conversation. You ALREADY HAVE their name from your call list — do NOT ask for it, do NOT ask them to confirm it, do NOT spell it back. Skip any "may I have your name" step entirely.*

- Retell replaces `{{contact_name}}` / `{{first_name}}` per call from the dynamic variables we already send (lines 331-335 of `run-test-run`, lines 198-201 of `tick-campaign`).

### 2. Suppress the "Can I confirm your full name?" auto-inject

In `buildTaskPrompt`, the block at lines 180-193 currently always adds a name-confirmation field. Change it so:

- When `useDynamicCallerName` is true → never inject any name-collection field (we already have it).
- When `useDynamicCallerName` is false AND `callerName` is provided (simulations) → don't inject either.
- Only inject the "ask for name" field when neither is true (the rare case of a cold call with no list data).

### 3. Pass the flag from real outbound call sites

Update three call sites to use the new mode:

- `supabase/functions/run-test-run/index.ts` line 261
- `supabase/functions/start-campaign/index.ts` line 143
- `supabase/functions/retell-llm-ws/index.ts` line 144 (inbound — flag false here, names truly unknown)
- `supabase/functions/apply-audit-recommendation/index.ts` line 453 (rebuild — flag true)

`simulate-call`, `simulate-turn`, `verify-feedback` keep passing a real `callerName` string and stay as-is.

### 4. Verbatim script gets the same treatment

In the verbatim-script block (lines 263-271), the `{{first_name}}` placeholder is currently replaced at prompt-build time with `trimmedCallerName.split(" ")[0]` — which is empty for real campaigns. Change it to **leave `{{first_name}}` and `{{contact_name}}` intact** when `useDynamicCallerName` is true, so Retell substitutes them per call.

This means your Hello Nation script can now say *"Hi {{first_name}}, Matt right here with Hello Nation…"* and each call will get the actual contact's first name.

## Files changed

- `supabase/functions/_shared/buildTaskPrompt.ts` — add 4th param `useDynamicCallerName`, branch CALLER block, branch name-field injection, branch verbatim placeholder substitution
- `supabase/functions/run-test-run/index.ts` — pass `true`
- `supabase/functions/start-campaign/index.ts` — pass `true`
- `supabase/functions/apply-audit-recommendation/index.ts` — pass `true`
- `supabase/functions/retell-llm-ws/index.ts` — explicit `false` (inbound, no list)
- No DB changes, no UI changes, no Retell API surface change

## What I'm NOT changing

- Simulation flows (`simulate-call`, `simulate-turn`, `verify-feedback`) — they keep their fake-name behavior
- The `must_collect_fields` UI — users can still manually add a name field if they want explicit confirmation for some agent
- Existing `opening_line` `{{first_name}}` substitution at the Retell `begin_message` level (already works via `resolveBeginMessage` stripping placeholders for the static field, while Retell substitutes them in the live LLM prompt)

## Expected outcome

- Hello Nation calls open with *"Hi Dave, Matt right here…"* — using the real uploaded name, never re-asking
- All campaign and test-run calls skip the "Can I confirm your full name?" step
- Inbound calls (no list) still ask for the name as today
- Simulations still randomize names as today

