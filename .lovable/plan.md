

# Security Fixes: Auth Module, Webhook Verification, and Edge Function Hardening

## Overview
Create a shared auth module, add webhook signature verification, add authentication checks to 6 edge functions, move pre-flight logic from tick-campaign to start-campaign, and update .gitignore.

## Changes

### 1. Create `supabase/functions/_shared/auth.ts`
Shared authentication module with `requireAuth`, `requireOrgAccess`, `unauthorizedResponse`, `AuthError`, and `corsHeaders`. Uses `supabase.auth.getUser(token)` to validate JWT and looks up `profiles.org_id` via service role client.

### 2. `supabase/functions/receive-retell-webhook/index.ts`
- Import `corsHeaders` from `_shared/auth.ts`, remove local `corsHeaders`
- Add `verifyRetellSignature()` function using HMAC-SHA256 with `RETELL_WEBHOOK_SECRET`
- Replace `await req.json()` with raw body read → signature verification → `JSON.parse(rawBody)`
- Gracefully degrades if `RETELL_WEBHOOK_SECRET` is not set (logs warning, allows through)

### 3. Add auth to 6 edge functions
Each gets: import from `_shared/auth.ts`, remove local `corsHeaders`, add `requireAuth(req)` after OPTIONS check.

- **`manage-retell-agent/index.ts`** — auth check only
- **`stop-call/index.ts`** — auth check only
- **`live-call-stream/index.ts`** — auth check only
- **`optimize-retell-agent/index.ts`** — auth check only
- **`create-test-run/index.ts`** — auth check + `requireOrgAccess(auth, project.org_id)` after project fetch
- **`start-campaign/index.ts`** — auth check + `requireOrgAccess(auth, campaign.agent_projects.org_id)` after campaign fetch; also receives ALL pre-flight logic moved from tick-campaign

### 4. `supabase/functions/start-campaign/index.ts` — Major refactor
- Add auth imports + `buildTaskPrompt`/`resolveBeginMessage` imports
- Add auth check + org access validation
- Move all pre-flight logic from tick-campaign here: agent fetch, transfer flag fix, voice/name/ambient sync, knowledge summarization, global behaviors merge, HIPAA injection, LLM prompt+tools injection
- Then trigger tick-campaign as before

### 5. `supabase/functions/tick-campaign/index.ts` — Simplify
- Import `corsHeaders` from `_shared/auth.ts`, remove local `corsHeaders`
- Remove `buildTaskPrompt` import
- Remove all pre-flight logic (lines 125-281): knowledge summarization, global behaviors, HIPAA, agent fetch, transfer fix, agent sync, duplicate voice sync, LLM prompt injection
- Add comment explaining pre-flight runs once in start-campaign
- Keep: campaign fetch, credit check, number rotation, contact queuing, batch call dispatch, redial logic

### 6. `.gitignore`
Add `.env`, `.env.local`, `.env.production`, `.env.*.local`

## Files Changed (no frontend files touched)
- `supabase/functions/_shared/auth.ts` — **New**
- `supabase/functions/receive-retell-webhook/index.ts` — Webhook signature verification
- `supabase/functions/manage-retell-agent/index.ts` — Auth check
- `supabase/functions/stop-call/index.ts` — Auth check
- `supabase/functions/create-test-run/index.ts` — Auth + org access check
- `supabase/functions/live-call-stream/index.ts` — Auth check
- `supabase/functions/optimize-retell-agent/index.ts` — Auth check
- `supabase/functions/start-campaign/index.ts` — Auth + org access + pre-flight logic
- `supabase/functions/tick-campaign/index.ts` — Remove pre-flight logic
- `.gitignore` — Add env patterns

