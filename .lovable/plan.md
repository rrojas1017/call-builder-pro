

# VoiceForge: Gap Analysis and Upgrade Plan

## Summary

The core foundation is solid -- all 10 database tables, RLS policies, auth, Bland integration, and basic UI are already in place. This plan closes the gaps to match the full spec: AI-powered spec generation, richer wizard UX, call evaluation, and the continuous improvement loop.

---

## 1. Database Schema Migration

Add missing columns to `agent_specs`:
- `mode` (outbound/inbound/hybrid)
- `opening_line` (text)
- `disclosure_required` (boolean, default true)
- `success_definition` (text)
- `transfer_required` (boolean, default false)
- `escalation_rules` (jsonb)
- `business_rules` (jsonb)

Add `rationale` column to `wizard_questions`.

Add `evaluation` (jsonb) column to `calls` table (for inline evaluation storage as specified, keeping the existing `evaluations` table as well for detailed records).

---

## 2. Edge Function: `ingest-agent-source`

New function that:
- Accepts `project_id` + either raw text or a storage file path
- Downloads file from `agent_sources` bucket if provided
- Extracts text (best-effort for .txt/.docx/.pdf)
- Saves combined text to `agent_projects.source_text`
- Calls `generate-spec` internally

---

## 3. Upgrade `generate-spec` to Use AI

Replace hardcoded ACA defaults with an AI call (using Lovable AI / supported model like `google/gemini-2.5-flash`) that:
- Takes the user's `source_text` description
- Uses the system prompt from the spec ("You are an AI Agent Architect...")
- Returns structured JSON: use_case, mode, tone_style, opening_line, disclosure fields, must_collect_fields, qualification/disqualification logic, success_definition, transfer settings, business_rules, retry_policy, and up to 5 clarification_questions with rationale
- Falls back to sensible defaults if AI is unavailable
- Stores the generated spec and wizard questions (with rationale)

---

## 4. Edge Function: `evaluate-call`

New function that:
- Takes a `call_id`, loads the call transcript + agent_spec
- Calls AI with the "Call Performance Auditor" system prompt
- Returns compliance_score, objective_score, overall_score, issues_detected, missed_fields, incorrect_logic, hallucination_detected, recommended_improvements
- Stores result in `calls.evaluation` jsonb column
- Also upserts into `evaluations` table for detailed tracking
- Called automatically by `receive-bland-webhook` after each call

---

## 5. Wizard UX Improvements

### Step 1 - "Build Your AI Call Agent"
- Update title/subtitle copy as specified
- Update textarea placeholder to the example text
- Button text: "Generate My Agent"

### Step 2 - "Let's Make It Work Perfectly"
- Update title/subtitle copy
- For each question, display three sections: the question, "Why this matters" (from `rationale`), and a suggested default (pre-filled answer)
- Keep max 5 questions

### Step 3 - "Review Your AI Agent"
- Replace raw JSON editor with a plain-English summary showing:
  - Who it calls
  - What it says (opening line)
  - What it collects
  - Qualification logic
  - Transfer logic
  - Success definition
- Add "Edit Details" button (toggles raw spec editor)
- Integrate campaign creation + CSV upload + "Start Calls" button directly into this step (instead of redirecting to separate Campaigns page)

---

## 6. Calls Page: Evaluation Display

- Show evaluation scores (compliance, objective, overall) in call detail view
- Display issues detected and recommended improvements
- Add "Apply Improvement" button per recommendation that:
  - Calls an edge function to patch `agent_specs`
  - Increments version
  - Records in `improvements` table
  - Shows confirmation with change summary

---

## 7. Apply Improvement Flow

New edge function `apply-improvement`:
- Takes `project_id` + `recommended_improvement` object
- Updates relevant `agent_specs` fields
- Increments version
- Inserts record into `improvements` table with `from_version`, `to_version`, `change_summary`, `patch`

Frontend "Apply Improvement" button on call detail triggers this and refreshes.

---

## 8. Update `receive-bland-webhook`

- After upserting the call record, call `evaluate-call` to auto-score each completed call
- Store evaluation result in `calls.evaluation`

---

## Technical Details

### Files to create:
- `supabase/functions/ingest-agent-source/index.ts`
- `supabase/functions/evaluate-call/index.ts`
- `supabase/functions/apply-improvement/index.ts`

### Files to modify:
- `supabase/functions/generate-spec/index.ts` (AI-powered rewrite)
- `supabase/functions/receive-bland-webhook/index.ts` (add evaluate-call trigger)
- `supabase/config.toml` (add new function entries)
- `src/pages/CreateAgentPage.tsx` (full wizard UX overhaul)
- `src/pages/CallsPage.tsx` (add evaluation display + apply improvement)
- DB migration for new columns

### Sequencing:
1. Database migration (new columns)
2. New edge functions (ingest-agent-source, evaluate-call, apply-improvement)
3. Updated edge functions (generate-spec with AI, webhook with evaluate)
4. Frontend wizard UX overhaul
5. Calls page evaluation + improvement UI

