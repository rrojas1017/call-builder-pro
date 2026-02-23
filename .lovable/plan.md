

# Fix Opening Line Name Mismatch + Trigger Test Call

## Problem Found

The `opening_line` in the database for the "ACA Qualifier" agent contains the name "Ashley" hardcoded:

> "Hi there, this is **Ashley** with the ACA Savings Center..."

But the `persona_name` is set to "Alex". The `run-test-run` function only replaces `{{agent_name}}` template variables -- since "Ashley" is written literally, it never gets swapped to "Alex".

This is why the agent keeps saying "Ashley" on every call.

## Fix

### 1. Update the opening line in the database

Replace the hardcoded "Ashley" with "Alex" (matching persona_name):

```sql
UPDATE agent_specs 
SET opening_line = REPLACE(opening_line, 'Ashley', 'Alex')
WHERE project_id = '66138346-0a1f-4c5f-b30b-fab52f15d3a3';
```

### 2. Trigger a test call

Create a new test run for the ACA Qualifier project and initiate the call to verify:
- The agent says "Alex" (not "Ashley")
- The voice is Ashley/minimax-Ashley (the voice, not the name)
- Transfer works when the lead qualifies

### 3. No code changes needed

The `run-test-run` function already syncs `voice_id`, `persona_name`, `transfer_phone_number`, and `begin_message` to Retell before dialing. Once the opening line data is corrected, all three issues should be resolved.

## Expected Outcome

- Agent introduces herself as "Alex" (persona_name)
- Agent speaks with the Ashley voice (voice_id: minimax-Ashley)
- Transfer to +13054332275 triggers when the lead qualifies
- Live transcription appears during the call via the dual-polling fix

