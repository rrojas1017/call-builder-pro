

# Fix: Stop personality traits from accumulating with every fix

## Problem
Every time a call is evaluated and improvements are applied, the AI suggests new `humanization_notes` entries. Because `humanization_notes` is treated as an append-only array field (via `mergeArrays`), and the dedup logic only catches exact substring matches (not semantic duplicates), the list grows indefinitely with semantically similar but textually different traits.

## Root cause
Two issues working together:
1. **`humanization_notes` is not protected** — In `evaluate-call/index.ts`, `PROTECTED_FIELDS` only includes `business_rules` and `must_collect_fields`. So humanization_notes changes get auto-applied.
2. **Weak dedup in `mergeArrays`** — The normalize function strips punctuation and checks substring inclusion, but "Be warm and friendly" vs "Show genuine warmth from the start" won't match, so both get added.

## Fix

### 1. Add `humanization_notes` to PROTECTED_FIELDS in evaluate-call
**File**: `supabase/functions/evaluate-call/index.ts` (line 807)

Add `"humanization_notes"` to the `PROTECTED_FIELDS` array. This prevents the evaluation system from auto-applying personality trait changes — they'll be logged but won't silently accumulate.

### 2. Cap humanization_notes in apply-audit-recommendation
**File**: `supabase/functions/apply-audit-recommendation/index.ts` (around line 96-99)

After `mergeArrays`, cap the result to a maximum of ~15 entries. If the merged array exceeds the cap, keep the first 15 (preserving the original creator-selected traits which come first).

### 3. Strengthen the evaluate-call prompt to stop suggesting humanization_notes
**File**: `supabase/functions/evaluate-call/index.ts` (around line 194)

Add to the format rules: "Do NOT suggest humanization_notes changes unless the agent sounds robotic or has severe naturalness issues (naturalness_score < 50). Personality traits are set by the creator and should not be modified routinely."

These three changes together will stop the trait accumulation: the prompt discourages unnecessary suggestions, protection blocks auto-apply, and the cap provides a safety net.

