

# Fix Campaign Prompt + Opening Line Injection

## Problem
The `tick-campaign` edge function injects the `general_prompt` (full task instructions) into the Retell LLM before each batch, but it does NOT update the `begin_message` (the opening line the agent actually says first). This means the agent may greet callers with a stale or mismatched opening line from a previous configuration, making it sound like a completely different profile.

Additionally, the Retell agent's `voice_id` is not synced from the spec during campaign execution, so voice mismatches can occur.

## Changes

### 1. Update `tick-campaign/index.ts` to inject `begin_message` alongside `general_prompt`
In the LLM prompt injection section (around line 186), add the resolved opening line as `begin_message` so the Retell LLM uses the correct greeting for each campaign run.

```text
Current code only sends:
  { general_prompt: taskPrompt }

Updated code sends:
  { general_prompt: taskPrompt, begin_message: resolvedOpeningLine }
```

This requires resolving the opening line with template variables (agent_name, first_name) before injection. Since the opening line needs per-contact variables like `{{first_name}}`, and Retell handles dynamic variables at call time, we should resolve only `{{agent_name}}` at the LLM level and leave `{{first_name}}` for Retell's dynamic variable system.

### 2. Sync `voice_id` from spec during tick-campaign pre-flight
Add a step that updates the Retell agent's `voice_id` from the spec if one is configured, ensuring the correct voice is used for each campaign.

### 3. Resolve the opening line properly
Use the same `[Agent Name]` and `{{agent_name}}` replacement logic already in `buildTaskPrompt` to resolve the opening line before sending it to Retell as `begin_message`.

## Technical Details

### File: `supabase/functions/tick-campaign/index.ts`

**Voice sync (in the pre-flight section, ~line 155):**
- After syncing `ambient_sound`, also sync `voice_id` from the spec if it's set and valid.

**Opening line injection (in the LLM prompt injection section, ~line 183):**
- Build the resolved opening line using spec.opening_line with agent_name substitution
- Include it in the PATCH to the Retell LLM as `begin_message`

```typescript
// Resolve opening line for begin_message
const agentName = spec.persona_name || campaign.agent_projects?.name || "Agent";
const resolvedOpening = spec.opening_line
  ? spec.opening_line
      .replace(/\{\{agent_name\}\}/gi, agentName)
      .replace(/\[Agent Name\]/gi, agentName)
  : null;

// In the LLM PATCH body:
const llmPatchBody: any = { general_prompt: taskPrompt };
if (resolvedOpening) {
  llmPatchBody.begin_message = resolvedOpening;
}
```

**Voice sync addition:**
```typescript
// Sync voice_id from spec
if (spec.voice_id) {
  const voiceRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
    body: JSON.stringify({ voice_id: spec.voice_id }),
  });
  if (voiceRes.ok) {
    console.log(`Synced voice_id to "${spec.voice_id}" on agent ${retellAgentId}`);
  }
}
```

## Expected Outcome
After this fix, every campaign tick will:
1. Set the correct opening line (begin_message) on the Retell LLM
2. Set the correct voice on the Retell agent
3. Set the correct general_prompt (already working)

This ensures the agent always matches the assigned profile regardless of what was previously configured on the Retell side.
