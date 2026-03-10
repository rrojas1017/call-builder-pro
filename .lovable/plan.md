

# Full Review: Feedback & Retraining Pipeline Bugs

After reviewing the entire pipeline (evaluate-call → apply-improvement → manage-retell-agent → run-test-run → EditAgentPage save), I've identified several bugs causing the "back and forth" where fixes break other things or feedback is ignored.

---

## Bug 1: EditAgentPage save does NOT sync critical config to Retell

**File:** `src/pages/EditAgentPage.tsx` lines 316-334

The `handleSave` function syncs to Retell with only `agent_name`, `voice_id`, and `language`. It does NOT send:
- `opening_line` (begin_message on Retell LLM)
- `temperature` (model_temperature on LLM)
- `transfer_required` / `transfer_phone_number` (tools on LLM)
- `speaking_speed` (voice_speed on agent)
- `interruption_threshold` (interruption_sensitivity on agent)
- `voicemail_message`
- `pronunciation_guide`
- `ambient_sound`

This means when a user saves the agent, the Retell backend stays out of sync with the DB spec. The NEXT test run re-syncs some of these via `run-test-run` pre-flight, but only `voice_id`, `persona_name`, and `ambient_sound` — not opening_line, transfer tools, speed, etc.

**Fix:** Send the full config in the `manage-retell-agent` update call from `handleSave`.

---

## Bug 2: Auto-applied humanness suggestions bypass version tracking

**File:** `supabase/functions/evaluate-call/index.ts` lines 628-636

Humanness suggestions are directly written to `agent_specs.humanization_notes` via a raw `update()` — bypassing the `apply-improvement` function entirely. This means:
- No version bump (spec.version stays the same)
- No entry in the `improvements` table
- The deduplication/history system is blind to these changes
- Score snapshots are recorded against the wrong version
- Subsequent evaluations see stale change history

**Fix:** Route humanness suggestion auto-application through `apply-improvement` with `replace_mode: true`.

---

## Bug 3: Multiple concurrent auto-apply paths create version race conditions

**File:** `supabase/functions/evaluate-call/index.ts`

A single evaluation triggers up to 4 independent spec-modification paths that can run concurrently:
1. **Verbal training feedback** (line 393) → calls `apply-improvement` (increments version)
2. **Humanness suggestions** (line 636) → raw DB update (no version)
3. **Critical improvements** (line 743) → calls `apply-improvement` (increments version)
4. **Pronunciation guide** (line 380) → raw DB update (no version)

If verbal training applies v5→v6, then a critical fix reads spec (still sees v5 due to no re-fetch), it patches v5→v6 too — overwriting the verbal training change. The `apply-improvement` function always reads the latest spec, but by the time the second call arrives, the first one's changes may or may not be committed.

**Fix:** Serialize all spec modifications through a single queue, or collect all patches and apply them in one batch call.

---

## Bug 4: run-test-run does NOT sync opening_line/temperature/transfer to Retell LLM

**File:** `supabase/functions/run-test-run/index.ts` lines 189-233

The pre-flight sync patches the Retell **agent** with `voice_id`, `agent_name`, `ambient_sound`, and `post_call_analysis_data`. But LLM-level settings (opening_line → begin_message, temperature → model_temperature, transfer tools → general_tools) are only synced via the separate `general_prompt` injection at line 276-293.

The `begin_message` IS synced (line 280), and the `general_tools` ARE synced (line 250-268). However, `model_temperature` is NOT synced during test runs. And `speaking_speed` / `interruption_threshold` are NOT synced in the agent pre-flight patch.

**Fix:** Add `voice_speed`, `interruption_sensitivity`, and `model_temperature` to the pre-flight sync.

---

## Bug 5: apply-improvement silently swallows errors for improvements table insert

**File:** `supabase/functions/apply-improvement/index.ts` lines 267-275

The improvements table INSERT uses service role, but the error is only logged — the function still returns `success: true`. If the insert fails (e.g. RLS issue), the spec is modified but no audit trail exists, making deduplication checks blind.

**Fix:** Treat improvements insert failure as a non-fatal warning in the response.

---

## Bug 6: Voice change by Retell sync on EditAgentPage save

**File:** `src/pages/EditAgentPage.tsx` line 327

`voice_id: selectedVoice || undefined` — if `selectedVoice` is empty string (e.g. user didn't touch voice), this sends `undefined` which is truthful in the `if (config?.voice_id)` check in manage-retell-agent... actually `undefined` would be falsy. But if `selectedVoice` is a stale value loaded from a previous session, it could push a wrong voice. This likely explains the "Dex voice changed" issue.

---

## Bug 7: Evaluation auto-research trigger is too aggressive

**File:** `supabase/functions/evaluate-call/index.ts` lines 780-806

Research is triggered when `humanness_suggestions.length >= 2` — which is almost every single call since the evaluator always generates suggestions. This causes excessive knowledge entries and potential noise in the agent's briefing.

**Fix:** Raise the threshold or add a cooldown (e.g., only research once per version).

---

## Proposed Fix Plan

### 1. Fix EditAgentPage Retell sync (Bug 1 + 6)
Send full config (opening_line, temperature, transfer, speed, interruption, voicemail, pronunciation, ambient) in the `manage-retell-agent` update call.

### 2. Serialize spec modifications in evaluate-call (Bugs 2 + 3)
Collect all patches (humanness, verbal, critical, pronunciation) into a single batch, then call `apply-improvement` once with a combined patch.

### 3. Fix run-test-run pre-flight sync (Bug 4)
Add `voice_speed`, `interruption_sensitivity` to agent patch and `model_temperature` to LLM patch.

### 4. Add research cooldown (Bug 7)
Check last research timestamp before triggering; skip if researched within last N calls.

### 5. Surface improvement insert errors (Bug 5)
Include a warning in the response if the audit trail insert fails.

---

## Files to Change

- `src/pages/EditAgentPage.tsx` — Expand Retell sync config in handleSave
- `supabase/functions/evaluate-call/index.ts` — Serialize all spec patches into single apply-improvement call; add research cooldown
- `supabase/functions/run-test-run/index.ts` — Add missing settings to pre-flight sync
- `supabase/functions/apply-improvement/index.ts` — Surface insert errors in response

