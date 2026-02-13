

## Problem

The **ACA Qualifier** agent's `opening_line` stored in the database contains:

> "Hi, I'm an **automated assistant** calling because you recently requested information about health insurance coverage..."

This makes the agent identify itself as a robot on every call, which undermines the entire humanization engine and the task prompt directive: *"You are a REAL PERSON on a phone call -- not AI, not a robot."*

## Fix

Update the `opening_line` in the `agent_specs` table for the ACA Qualifier agent to sound like a real person calling. The new line should follow the existing "permission-first" conversational style (e.g., "Hey {{first_name}}, you got a quick minute?").

### Proposed New Opening Line

> "Hi there, I'm calling because you recently asked about health insurance options. This call may be recorded for quality purposes. Do you have a quick minute so I can see if you might qualify for some ACA marketplace savings?"

This keeps:
- The reason for calling (they requested info)
- The recording disclosure
- The consent ask
- A natural, human tone

### Technical Details

- **Single database update** on the `agent_specs` table for the ACA Qualifier project
- No code changes needed -- just a data fix
- The `disclosure_text` field for this agent is also wrong (it says "Nationwide coverage (all 50 states)" which looks like a wizard answer got saved to the wrong field). This will also be corrected to a proper compliance disclosure.

### Changes

1. **Update `agent_specs.opening_line`** for the ACA Qualifier to remove "automated assistant" and use a natural, human greeting
2. **Update `agent_specs.disclosure_text`** to a proper compliance statement (current value "Nationwide coverage (all 50 states)" is not a disclosure)

