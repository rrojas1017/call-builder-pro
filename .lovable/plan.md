

## Add Retell AI as A/B Voice Provider (Safety-First Approach)

### Guiding Principle: Zero Risk to Existing Bland AI Flows

Every modification uses an **additive-only** pattern. Existing Bland AI logic stays completely untouched -- Retell code runs in separate branches that only activate when `voice_provider = 'retell'` is explicitly set on an agent. Default is always `'bland'`.

### Database Changes (All Additive -- No Existing Columns Modified)

**Alter `agent_specs`**: Add two new columns with safe defaults
- `voice_provider` (text, default `'bland'`) -- existing agents remain on Bland automatically
- `retell_agent_id` (text, nullable)

**Alter `calls`**: Add two new columns
- `retell_call_id` (text, nullable, unique) -- parallel to existing `bland_call_id`
- `voice_provider` (text, default `'bland'`) -- tags which provider made the call

**Alter `test_run_contacts`**: Add one column
- `retell_call_id` (text, nullable)

**Alter `campaigns`**: Add one column
- `retell_batch_id` (text, nullable)

All new columns are nullable or have defaults that match existing behavior. No existing columns are renamed, removed, or retyped.

### Secret Required
- `RETELL_API_KEY` -- stored securely as a backend secret

### New Backend Function: `receive-retell-webhook` (New File Only)

A brand new edge function (`supabase/functions/receive-retell-webhook/index.ts`) that:
- Parses Retell's post-call webhook payload
- Maps Retell statuses to internal statuses (completed, no_answer, failed, etc.)
- Upserts into the `calls` table using `retell_call_id`
- Handles test lab flow (updates `test_run_contacts`) and campaign flow (triggers `tick-campaign`)
- Triggers `evaluate-call` for completed calls (reuses existing evaluation pipeline)

This is an entirely new file -- no existing webhook code is touched.

### Modified Backend Functions (Additive Branching Only)

**`run-test-run/index.ts`** -- Safety approach:
- After loading the agent spec (line ~272), read `voice_provider`
- If `voice_provider === 'retell'`: branch into a NEW code block that calls Retell's `POST /v2/create-phone-call` API
- If `voice_provider === 'bland'` (the default): the EXISTING Bland code runs exactly as-is, completely unchanged
- The Bland code path is wrapped in an `else` block -- no lines are deleted or reordered

**`tick-campaign/index.ts`** -- Same safety approach:
- After loading the spec (line ~138), check `voice_provider`
- If `'retell'`: loop contacts and call Retell individually (no batch API)
- If `'bland'` (default): existing batch API code runs untouched

### Frontend Changes

**`EditAgentPage.tsx`** -- Add "Voice Provider" section (new section inserted between Identity and Script sections):
- Two-card selector (same styling as existing "Call Ending" toggle): "Bland AI" and "Retell AI"
- When Retell is selected, show a text input for "Retell Agent ID"
- Voice selection and Background Audio sections only show when Bland is selected (Retell manages voice on their platform)
- The save handler sends the new `voice_provider` and `retell_agent_id` fields alongside existing data

**`CreateAgentPage.tsx`** -- Add provider selection in Step 3 (Review and Save):
- Same two-card selector as EditAgentPage
- Retell Agent ID field when Retell is chosen
- Saved alongside existing `voice_id`, `transfer_required`, etc.

**`AgentsPage.tsx`** -- Add small provider badge on each agent card:
- Fetch `voice_provider` from `agent_specs` in the existing query
- Show a subtle badge ("Bland" or "Retell") next to the mode badge
- No changes to layout, card structure, or click behavior

**`CallsPage.tsx`** -- Add provider indicator per call:
- Use the new `voice_provider` column on `calls`
- Show a small text/badge next to the call ID in the list
- No changes to filtering, detail view, or evaluation display

**`AppSidebar.tsx`** -- No changes needed. Retell is a provider option, not a new page.

**`App.tsx`** -- No changes needed for Retell (SMS route addition is separate).

### What Stays Completely Unchanged
- `receive-bland-webhook/index.ts` -- not touched at all
- `evaluate-call/index.ts` -- not touched; both providers feed into it identically
- `start-campaign/index.ts` -- not touched
- All existing RLS policies
- All existing database columns and their types
- The default behavior of every existing agent (they default to `voice_provider = 'bland'`)

### Files to Create
1. `supabase/functions/receive-retell-webhook/index.ts`

### Files to Modify (Additive Only)
1. `supabase/functions/run-test-run/index.ts` -- Add Retell branch after spec load
2. `supabase/functions/tick-campaign/index.ts` -- Add Retell branch after spec load
3. `src/pages/EditAgentPage.tsx` -- Add provider selector section
4. `src/pages/CreateAgentPage.tsx` -- Add provider selector in Step 3
5. `src/pages/AgentsPage.tsx` -- Add provider badge
6. `src/pages/CallsPage.tsx` -- Add provider indicator
7. Database migration -- New columns only (all with safe defaults)

### Risk Summary

| Area | Risk | Mitigation |
|------|------|------------|
| Existing Bland calls | None | Default `voice_provider = 'bland'` means all existing agents use unchanged code paths |
| Webhook processing | None | New webhook is a separate function; existing `receive-bland-webhook` is untouched |
| Evaluation pipeline | None | `evaluate-call` receives the same data shape regardless of provider |
| Database schema | None | All changes are additive columns with nullable/default values |
| Campaign dispatching | Low | New Retell branch only activates when explicitly configured; Bland path unchanged |
| Frontend | None | New UI sections are additive; existing forms and displays untouched |

