

# Upgrade Business Rules Extraction to Pro Model

## Change

Update `supabase/functions/parse-business-rules/index.ts` to use `google/gemini-2.5-pro` instead of `google/gemini-2.5-flash` in both `extractRulesFromText` (line 117) and `extractRulesFromBinary` (line ~145). Also increase `max_tokens` from 4096 to 8192 to handle larger rule sets.

| File | Change |
|------|--------|
| `supabase/functions/parse-business-rules/index.ts` | Switch model to `google/gemini-2.5-pro`, increase `max_tokens` to 8192 in both extraction functions |

