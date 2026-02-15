

## Fix Cross-Domain Hallucination in Evaluator Improvements

### Problem

The AI evaluator (Claude) suggested travel-themed rapport rules ("Orlando is such a fun choice!", "family trip sounds wonderful!") for an ACA health insurance agent. When applied, these irrelevant rules were stored in `business_rules`, and the next evaluation then flagged "Didn't fully explore the travel-related business rules" -- creating a confusing loop.

This is a two-part problem:
1. Claude hallucinated improvements from the wrong domain
2. The system blindly applied them without checking relevance

### Fix (Two Parts)

#### Part 1: Add Domain Context to Evaluator Prompt

**File: `supabase/functions/evaluate-call/index.ts`**

Add an explicit instruction to the system prompt telling Claude to only suggest improvements relevant to the agent's actual use case/vertical:

```
DOMAIN CONSTRAINT: This agent's use case is "${spec.use_case || 'general'}".
ALL suggested improvements MUST be directly relevant to this domain.
Do NOT suggest examples, rapport-building lines, or business rules from
unrelated industries (e.g., travel examples for a health insurance agent).
Every suggested_value must make sense in the context of "${spec.use_case}".
```

This goes right after the existing ANTI-REPETITION DIRECTIVE in the system prompt.

#### Part 2: Immediate Data Fix

**File: `supabase/functions/apply-improvement/index.ts`**

Add a lightweight domain-relevance guard for `business_rules` and `humanization_notes` fields. Before applying, check if the suggested value contains keywords clearly from a different vertical than the agent's `use_case`. If mismatched, store a warning but skip the application.

Additionally, a one-time database cleanup is needed to remove the travel-related content currently in this agent's spec.

### Database Cleanup (one-time migration)

Clear the incorrectly applied travel business rules from the affected agent:

```sql
UPDATE agent_specs 
SET business_rules = NULL 
WHERE project_id = '5d72204a-caa3-4a41-a980-bfb6d413060b';
```

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/evaluate-call/index.ts` | Add DOMAIN CONSTRAINT directive to system prompt using the agent's use_case |
| `supabase/functions/apply-improvement/index.ts` | Add domain-relevance validation before applying improvements to business_rules |
| Database migration | Clear stale travel-themed business_rules from the affected ACA agent |

