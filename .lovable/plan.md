

# Fix: AI Responses Being Cut Off Mid-Sentence in Simulations

## Problem
Agent responses in the live simulation are truncated mid-sentence (e.g., "Mi nombre es María y le aseguro que aquí" just stops). The customer then reacts to the cut-off, creating a cascade of confused exchanges.

## Root Cause
In `callGemini()` (ai-client.ts line 67), the token limit is sent as `max_completion_tokens`. However, the Lovable AI Gateway (OpenAI-compatible endpoint) for Gemini models may not recognize `max_completion_tokens` and instead expects `max_tokens` in the request body. When unrecognized, the gateway falls back to a very low default output limit, causing responses to be cut at ~20-30 tokens.

The `simulate-turn` function passes `max_tokens: 512`, which `callGemini` converts to `max_completion_tokens: 512` — but the gateway ignores it.

## Fix

### `supabase/functions/_shared/ai-client.ts`
In `callGemini()`, send **both** `max_tokens` and `max_completion_tokens` to ensure compatibility regardless of which field the gateway honors:

```typescript
if (opts.max_tokens !== undefined) {
  body.max_completion_tokens = opts.max_tokens;
  body.max_tokens = opts.max_tokens;
}
```

### `supabase/functions/simulate-turn/index.ts`
Increase `max_tokens` from `512` to `1024` as a safety margin — the strip logic already trims role prefixes, so extra tokens won't cause bloat.

## Scope
Two lines in `ai-client.ts`, one number change in `simulate-turn/index.ts`.

