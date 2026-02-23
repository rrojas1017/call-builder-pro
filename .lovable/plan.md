

# Fix ACA Qualifier Agent Configuration

## Problem
Two issues were found with the bulk calling test:

1. **Agent says "[Agent Name]" literally on calls** -- The `persona_name` field is null, and the `opening_line` uses `[Agent Name]` (square brackets) instead of the template syntax `{{agent_name}}`. The prompt builder only substitutes `{{agent_name}}`, so the square-bracket text passes through verbatim.

2. **No webhook callbacks received** -- Retell dispatched the batch successfully (batch_call_f0738896dc8fdd4d39a3d, status 200), but no call outcome data was received. This means the Retell agent likely doesn't have the webhook URL configured in the Retell dashboard.

## Changes

### 1. Fix the ACA Qualifier agent spec in the database
- Set `persona_name` to a real name (e.g., "Ashley" to match the voice, or another name of your choosing)
- Replace the `opening_line`'s `[Agent Name]` with the proper template variable `{{agent_name}}`

**Before:**
```
persona_name: null
opening_line: "Hi there, this is [Agent Name] with the ACA Savings Center..."
```

**After:**
```
persona_name: "Ashley"
opening_line: "Hi there, this is {{agent_name}} with the ACA Savings Center..."
```

### 2. Add a safety net in `buildTaskPrompt.ts`
- Also replace `[Agent Name]` (square-bracket style) with the persona name, so any old-format opening lines are handled automatically
- This prevents the same issue if other agents have the same bracket-style placeholder

### 3. Add a safety net in `tick-campaign/index.ts`
- In the dynamic variables block, ensure `agent_name` always has a fallback value (e.g., the project name) instead of an empty string when `persona_name` is null

## Manual Step Required
In the **Retell dashboard**, verify that agent `agent_bff4d628c037a7c3526a122d5c` has the webhook URL set to:
```
https://kmwaqmowstrhwmevwweg.supabase.co/functions/v1/receive-retell-webhook
```
Without this, calls will complete but no outcome data will flow back into the system.

## Technical Details
- The `buildTaskPrompt` function at line 107-109 substitutes `{{agent_name}}` but not `[Agent Name]`
- The `tick-campaign` function at line 257 passes `spec.persona_name || ""` as the dynamic variable -- when null, the LLM receives an empty string
- The database migration will update the existing agent spec record for project `66138346-0a1f-4c5f-b30b-fab52f15d3a3`

