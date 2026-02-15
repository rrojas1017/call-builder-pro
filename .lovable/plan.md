

## Fix: Campaign Prompt Parity with University

### Root Cause Analysis

After tracing the prompt-building pipeline across all three call paths, I found **two significant issues** causing the behavioral gap:

### Issue 1: Template Variables Not Replaced in Campaign Task Prompt

In `run-test-run` (University), the task prompt gets template variable replacement per contact:
```
const contactTask = replaceTemplateVars(baseTask, contact);  // line 182
```

In `tick-campaign` (Campaigns), the task is set as a **global** setting for the batch API and `replaceTemplateVars` is only applied to the `first_sentence` in each call object -- **never to the task itself**:
```
let task = buildTaskPrompt(spec, [], knowledgeBriefing);  // line 148
// ... task goes straight into globalSettings without replaceTemplateVars
```

This means campaign calls receive a prompt with literal `{{first_name}}` strings instead of the caller's actual name. The agent can't use the caller's name naturally, making it sound robotic and impersonal compared to University calls.

### Issue 2: Inbound Numbers Use a Completely Separate, Outdated Prompt Builder

`manage-inbound-numbers/index.ts` has its own local `buildTaskPrompt` function (lines 9-42) that is hardcoded and missing:
- Humanization notes / style guide
- Knowledge briefing (AI-summarized knowledge)
- Winning patterns
- FPL/SEP qualification logic updates
- Email collection injection
- Name confirmation injection
- Qualification and disqualification rules from the spec
- The "REAL PERSON" directive

It just appends global behaviors as a numbered list at the end, with none of the iterative learning the agent has accumulated.

### Fixes

**File: `supabase/functions/tick-campaign/index.ts`**

The batch API sends one global `task` for all contacts, so we cannot template per-contact. However, we can remove literal template references from the task prompt and instead rely on the `first_sentence` (which IS templated per contact) to establish the caller's name. No code change needed for the prompt builder itself -- the `first_sentence` already carries the name. The real fix is ensuring the prompt doesn't reference `{{first_name}}` in ways that break when un-replaced. This is already handled by `buildTaskPrompt` (it doesn't inject raw template vars into the task body). So this path is actually fine on closer inspection -- the template vars issue is minor here.

**However**, a real fix is needed: move the `replaceTemplateVars` into the per-contact `call_objects` task field instead of using a single global task. This gives each contact a personalized prompt, matching exactly how University works.

Concrete change: Instead of putting `task` in `globalSettings`, build the task per contact in the `callObjects` map and include it per call object. This mirrors the University approach where each call gets its own templated prompt.

**File: `supabase/functions/manage-inbound-numbers/index.ts`**

Replace the local `buildTaskPrompt` with the shared one from `_shared/buildTaskPrompt.ts`. Also add:
- Knowledge briefing via `summarize-agent-knowledge` invocation
- Merge global behaviors into `humanization_notes` (matching the campaign/university pattern)
- Pass the full spec through the shared builder so all learning is included

### Summary of Changes

| File | Change |
|---|---|
| `tick-campaign/index.ts` | Move task from global to per-contact in call_objects with `replaceTemplateVars` applied, so each contact gets a personalized prompt |
| `manage-inbound-numbers/index.ts` | Delete local `buildTaskPrompt`, import shared builder, add knowledge briefing + global behaviors merge (matching university/campaign pattern) |

### Result

All three call paths (University, Campaign, Inbound) will produce identical prompts from the same shared builder, with the same knowledge, humanization, winning patterns, and template variable handling. The agent will behave consistently everywhere.

