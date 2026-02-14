

## Fix Task Prompt to Consume Spec Fields and Knowledge Base

### The Problem

There are **three separate copies** of `buildTaskPrompt`, and only one of them (in `run-test-run`) actually uses the spec's dynamic fields. The other two ignore coaching improvements entirely:

| Location | Uses `qualification_rules` | Uses `humanization_notes` | Uses Knowledge Base | Uses `disqualification_rules` |
|---|---|---|---|---|
| `supabase/functions/run-test-run/index.ts` | Yes | Yes | Yes | Yes |
| `supabase/functions/tick-campaign/index.ts` | **No** | **No** (uses global only) | Appended after | **No** |
| `src/lib/buildTaskPrompt.ts` (client) | **No** | **No** | **No** | **No** |

This means:
- **Test calls** (Gym) get the coaching improvements because `run-test-run` reads `qualification_rules`, `humanization_notes`, and knowledge entries
- **Real campaign calls** use a completely different hardcoded prompt that ignores all of those fields
- **Client-side preview** is hardcoded to health insurance only

The coaching loop is broken: Claude evaluates calls, suggests improvements, they get saved to `agent_specs`, but `tick-campaign` never reads them back.

---

### Solution: Unify Around the `run-test-run` Prompt Builder

The `run-test-run` version is already correct. The fix is to:

1. **Extract** the good `buildTaskPrompt` and its helpers from `run-test-run` into a shared file (`supabase/functions/_shared/buildTaskPrompt.ts`)
2. **Replace** the hardcoded version in `tick-campaign` with an import of the shared builder
3. **Replace** the client-side `src/lib/buildTaskPrompt.ts` with a version that accepts the same spec shape (for preview purposes)

---

### Changes

#### 1. Create shared prompt builder: `supabase/functions/_shared/buildTaskPrompt.ts`

Extract from `run-test-run/index.ts` (lines 31-173):
- `isHealthAgent()`
- `buildCompactFplSep()`
- `buildCompactKnowledge()`
- `buildCompactStyle()`
- `buildTaskPrompt(spec, knowledge, knowledgeBriefing?)`
- `replaceTemplateVars()`

All exported. This becomes the single source of truth.

#### 2. Update `supabase/functions/tick-campaign/index.ts`

- Remove the local `isHealthAgent()`, `buildCompactFplSep()`, `buildCompactStyle()`, `buildTaskPrompt()` functions (lines 9-92)
- Import from `../_shared/buildTaskPrompt.ts`
- Update the call site (line 178) to pass knowledge entries and the knowledge briefing:
  - Fetch `agent_knowledge` entries for the project (like `run-test-run` does, as fallback)
  - Merge `globalTechniques` into `spec.humanization_notes` (like `run-test-run` does at lines 274-280)
  - Call `buildTaskPrompt(spec, knowledgeEntries, knowledgeBriefing)`

This ensures campaign calls now use:
- `spec.qualification_rules` -- dynamic qualification logic from coaching
- `spec.disqualification_rules` -- disqualification rules
- `spec.humanization_notes` -- conversation style improvements from evaluations
- `spec.success_definition` / `spec.use_case` -- agent purpose
- Knowledge base entries (product knowledge, objection handling, etc.)

#### 3. Update `supabase/functions/run-test-run/index.ts`

- Remove the local prompt builder functions (lines 31-183)
- Import from `../_shared/buildTaskPrompt.ts`
- No logic changes needed -- the behavior stays identical

#### 4. Update `src/lib/buildTaskPrompt.ts` (client-side preview)

- Rewrite to mirror the shared builder's logic (consuming `qualification_rules`, `disqualification_rules`, `humanization_notes`, knowledge entries)
- Expand the `AgentSpec` interface to include all fields the shared builder uses
- Remove the hardcoded health-insurance-only qualification section
- This file is used for prompt preview in the UI, so it should reflect what actually gets sent to the phone agent

#### 5. Keep `replaceTemplateVars` in the shared file

Both `tick-campaign` and `run-test-run` have identical copies. Consolidate into the shared file.

---

### What This Fixes

1. **Coaching improvements now flow to real calls**: When Claude suggests changing `qualification_rules` or adding `humanization_notes`, those changes are consumed by `tick-campaign` on the next campaign run
2. **Single source of truth**: One prompt builder, three consumers (test runs, campaigns, client preview)
3. **No more hardcoded health insurance logic in campaigns**: The prompt dynamically includes FPL rules only when the use case is health-related, and uses the spec's custom `qualification_rules` for everything else
4. **Knowledge base reaches campaigns**: Agent knowledge entries are now fetched and included in campaign prompts, not just test run prompts

### What Stays the Same

- The `evaluate-call` and `apply-improvement` functions (no changes)
- The agent knowledge table and summarization logic
- The Bland/Retell API call structures
- All frontend evaluation UI (severity badges, regression alerts, etc.)

