

# Fix: Bulk Sync — Add response_engine Back + Handle Multi-Language

## Problem
Two issues preventing all 8 agents from syncing:

1. **response_engine is required by Retell API** — removing it entirely was wrong. The working `manage-retell-agent` function sends `response_engine: { type: "retell-llm" }` without an `llm_id`, which triggers Retell to auto-create the LLM. The bulk-sync function needs to do the same.

2. **Trip Easy Agent has language "en, es"** — this isn't a valid Retell language code. The function needs to detect multi-language values and map them to `"multi"`.

## Changes

**File:** `supabase/functions/bulk-sync-retell-agents/index.ts`

### Change 1: Add response_engine back
Add `response_engine: { type: "retell-llm" }` to the `createBody` object (matching the pattern in `manage-retell-agent`).

### Change 2: Handle multi-language
Before the language mapping, check if the language string contains a comma or multiple codes. If so, use `"multi"`. Otherwise, apply the existing `LANG_MAP` lookup with a fallback to `"en-US"`.

```
// Pseudocode
const lang = spec.language || "en";
let retellLang: string;
if (lang.includes(",")) {
  retellLang = "multi";
} else {
  retellLang = LANG_MAP[lang.trim()] || lang;
  // If still not a valid Retell format (no dash), default to en-US
  if (!retellLang.includes("-") && retellLang !== "multi") {
    retellLang = "en-US";
  }
}
```

## Files
- **Modified**: `supabase/functions/bulk-sync-retell-agents/index.ts`

## After Fix
Redeploy, then invoke again to provision all 8 agents. Then run a test call on one.
