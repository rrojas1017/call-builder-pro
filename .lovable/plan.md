

# Auto-Train Edge Function + Knowledge & Learning Improvements

## Changes

### 1. Create `supabase/functions/auto-train/index.ts`
New edge function that runs unattended training loops:
- Authenticates via `requireAuth` + org access check on the project
- Runs up to N rounds (max 10) of: create test run → poll for completion → evaluate calls → auto-apply fixes
- Regression rollback: if avg score drops >0.5 from previous round, records a ROLLBACK improvement and stops applying that fix
- Early exit if score reaches 9.0+
- Saves score snapshots after each round
- Deduplicates recommendations by field, prioritizing higher severity

### 2. Update `supabase/config.toml`
Add `[functions.auto-train]` with `verify_jwt = false` (auth handled in code).

### 3. Update `supabase/functions/_shared/buildTaskPrompt.ts`
In `buildCompactKnowledge`: raise truncation limit from 150→300 chars with smart sentence-boundary cutting, increase entries per category from 4→5.

### 4. Update `supabase/functions/learn-from-success/index.ts`
Lower minimum successful calls threshold from 5→3.

## Files Changed
- `supabase/functions/auto-train/index.ts` — **New**
- `supabase/config.toml` — Add auto-train config
- `supabase/functions/_shared/buildTaskPrompt.ts` — Knowledge truncation improvement
- `supabase/functions/learn-from-success/index.ts` — Lower threshold

