

# Fix: "Apply Fix" crashes on business_rules with non-JSON string

## Root Cause

The edge function logs show:
```
SyntaxError: Unexpected token 'T', "The AI mis"... is not valid JSON
```

The `apply-improvement` function has **4 unguarded `JSON.parse()` calls** (lines 158, 165, 205, 239) that crash when `business_rules` (or another JSON column) contains a prose string instead of valid JSON. This happens when a previous automated process (e.g., evaluate-call or save-wizard-answers) stores plain text into `business_rules`.

Specifically, line 205:
```typescript
const existingObj = typeof existingBR === "string" ? JSON.parse(existingBR) : { ...existingBR };
```
If the existing spec's `business_rules` is a prose string like `"The AI missed..."`, this throws.

## Fix

**File:** `supabase/functions/apply-improvement/index.ts`

Wrap all 4 bare `JSON.parse()` calls in try-catch blocks with sensible fallbacks:

1. **Line 158** (`JSON.parse(currentBR)`) — fallback to `{ notes: currentBR }`
2. **Line 165** (`JSON.parse(currentParentValue)`) — fallback to `{}`
3. **Line 205** (`JSON.parse(existingBR)`) — fallback to `{ notes: existingBR }`
4. **Line 239** (`JSON.parse(currentBR)`) — fallback to `{ notes: currentBR }`

This ensures the function never crashes on malformed stored data, and preserves the original string content as a `notes` key so it isn't lost.

