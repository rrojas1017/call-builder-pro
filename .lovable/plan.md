

# Fix: Make Task Prompt Dynamic + Replace Template Variables

## Problem
Two issues caused the nonsensical call:

1. **Hardcoded ACA prompt**: `buildTaskPrompt()` in `run-test-run/index.ts` always wraps everything in ACA health insurance context ("You are an ACA pre-qualification agent", "Medicare disqualifies", etc.) regardless of what the agent actually does. Your travel agent got ACA qualification logic baked in.

2. **Unresolved template variables**: The opening line contains `{{first_name}}` but the code never replaces it with the contact's actual name, so Bland AI literally says "Hi {{first_name}}".

## Changes

### 1. Rebuild `buildTaskPrompt()` to be industry-agnostic
Replace the hardcoded ACA prompt with a generic template that uses the spec's actual fields:
- Use `spec.use_case` or `spec.tone_style` to describe the agent role instead of hardcoding "ACA pre-qualification agent"
- Use `spec.qualification_rules` and `spec.disqualification_rules` as-is instead of hardcoding Medicare/Medicaid logic
- Use `spec.disclosure_text` as the disclosure (already done) but remove ACA framing
- Use `spec.success_definition` to describe what a successful call looks like
- Keep `must_collect_fields` and `formatField()` but remove ACA-specific labels -- if the field isn't in the labels map, just use the field name as the question

The new prompt structure:
```
You are a professional outbound calling agent.

PURPOSE: {use_case / success_definition}

DISCLOSURE (read at the start): "{disclosure_text}"

RULES:
- Obtain verbal consent before proceeding
- Tone: {tone_style}
- Keep conversation concise and professional

INFORMATION TO COLLECT:
1. {field_1}
2. {field_2}
...

QUALIFICATION: {qualification_rules as text}
DISQUALIFICATION: {disqualification_rules as text}

{transfer instructions if transfer_phone_number is valid}

FALLBACK: If unable to collect info after 2 attempts, end politely.
SUMMARY: Provide JSON summary with collected fields.
```

### 2. Add template variable replacement
Before sending the payload to Bland, replace common template variables in `task` and `first_sentence`:
- `{{first_name}}` -- extracted from contact `name` (split on space, take first)
- `{{last_name}}` -- extracted from contact `name` (split on space, take last)
- `{{name}}` -- full contact name
- `{{phone}}` -- contact phone

### Files to modify
- **`supabase/functions/run-test-run/index.ts`**: Rewrite `buildTaskPrompt()` to be generic; add template variable replacement before building `blandPayload`

