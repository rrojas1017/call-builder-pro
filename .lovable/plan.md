

# Add a "Script / Talk Track" field for verbatim multi-paragraph openers

## What you're hitting
You have a full multi-paragraph script for the Hello Nation agent (Matt → Dave intro, partnership pitch, "final three candidates" close). The Edit Agent page only has:

- **Opening Line Template** — a 2-row textarea meant for one sentence like *"Hey {{first_name}}, this is {{agent_name}}…"*
- **Tone / Style** — a single-line input
- **Success Definition** — outcome description, not a script

There's no field designed to hold a verbatim multi-paragraph talk track. If you paste your Hello Nation script into "Opening Line," it'll work technically (it gets sent to Retell as `begin_message`), but the UI cramps it and other systems (auto-training, opening-line guard) treat it as a one-liner and may try to "fix" it.

## What I'll add

### 1. New "Verbatim Script" field on the agent spec
- New nullable `verbatim_script TEXT` column on `agent_specs` (migration)
- Edit Agent page: new large textarea (8 rows) directly under "Opening Line Template," labeled **"Verbatim Script (optional)"** with helper text: *"Paste a word-for-word talk track. When set, this overrides the opening line and becomes the agent's first message."*
- Same field exposed on the Create Agent wizard's review step
- Saved alongside other spec fields in the existing `update`/`insert` calls

### 2. Wire into Retell sync
- In `EditAgentPage.handleSave` and `manage-retell-agent`, if `verbatim_script` is set, use it as Retell's `begin_message` **instead of** `opening_line`
- The script gets the same `{{first_name}}` / `{{agent_name}}` placeholder support
- `buildTaskPrompt` (edge function) prepends the script to the system prompt as: *"Begin the call by delivering this exact script verbatim, then continue naturally: …"*

### 3. Protect from auto-training overwrites
- Add `verbatim_script` to the protected-fields list in `apply-improvement` so the auto-training loop can't silently rewrite a manually-pasted talk track
- Skip the `openingLineGuard` name-mismatch check when `verbatim_script` is in use (the persona name "Matt" lives inside the script body, not via `{{agent_name}}`)

## Files changed

- `supabase/migrations/<new>.sql` — add `verbatim_script TEXT` to `agent_specs`
- `src/pages/EditAgentPage.tsx` — new textarea in the Script section + save logic
- `src/pages/CreateAgentPage.tsx` — same textarea on the wizard
- `supabase/functions/manage-retell-agent/index.ts` — prefer `verbatim_script` over `opening_line` for `begin_message`
- `supabase/functions/_shared/buildTaskPrompt.ts` — prepend verbatim instruction when set
- `supabase/functions/apply-improvement/index.ts` — add `verbatim_script` to protected fields

## What I'm NOT changing
- Existing `opening_line` field stays — agents without a verbatim script keep working exactly as today
- No change to voice, tone, or success-definition logic
- No new tables, no Retell API surface change beyond the `begin_message` source switch

## How to use it for Hello Nation (after this ships)
1. Open the Hello Nation agent → Edit
2. Set **Persona Name**: `Matt`
3. Paste your full script into the new **Verbatim Script** field
4. Save — Retell agent re-syncs automatically
5. Test call → Matt opens with the exact words you wrote, then continues naturally into qualification

## Expected outcome
- A real home for verbatim talk tracks (not a 2-line workaround)
- Auto-training won't quietly rewrite your hand-crafted scripts
- One save, immediate Retell sync, ready to test

