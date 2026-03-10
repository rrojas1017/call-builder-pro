

# Spec Change Protection System — Conflict Detection, Impact Preview, Change Log

## Overview

Add three layers of protection to the agent spec modification pipeline: (1) AI-powered conflict detection before changes are applied, (2) a pending changes review queue for blocked conflicts, and (3) a visible change log of every modification.

## Database Changes

### New table: `spec_change_log`
Tracks every modification to an agent spec with before/after values, source, and conflict info.

- `id`, `project_id` (FK to `agent_projects`), `org_id`, `field_changed`, `old_value`, `new_value`
- `change_type` (patch, add_knowledge, remove_knowledge, rewrite, rollback)
- `source` (auto_train, user_feedback, manual_edit, etc.), `source_category`, `source_detail`
- `conflict_detected`, `conflict_description`, `was_auto_applied`, `was_user_approved`, `approved_by`
- RLS: org members can SELECT; service_role can ALL
- Index on `(project_id, created_at DESC)`

### New table: `pending_spec_changes`
Holds changes that were blocked due to detected conflicts, awaiting human review.

- `id`, `project_id` (FK to `agent_projects`), `org_id`, `field_to_change`, `current_value`, `proposed_value`
- `change_type`, `source`, `source_category`, `source_detail`
- `conflict_type` (contradiction, overwrite, ambiguity, scope_expansion), `conflict_description`
- `affected_fields` (jsonb), `impact_summary`, `status` (pending, approved, rejected, auto_applied)
- `reviewed_by`, `reviewed_at`, `review_notes`
- RLS: org members SELECT + admins UPDATE; service_role ALL
- Index on `(project_id, status, created_at DESC)`

## Edge Function Changes

### Modify `apply-audit-recommendation/index.ts`
After the AI maps the recommendation but **before** applying the patch:
1. Build a conflict detection prompt with current spec config (business_rules, qualification_rules, must_collect_fields, etc.) and the proposed change
2. Call Gemini Flash to check for contradictions, overwrites, ambiguity, or scope expansion
3. If **blocking** conflict → insert into `pending_spec_changes` + log to `spec_change_log` → return `{ held_for_review: true, conflict: {...} }`
4. If **warning** → apply normally but flag `conflict_detected: true` in the log
5. If **no conflict** → apply normally and log to `spec_change_log`
6. All successful applies also log old/new values to `spec_change_log`

### New `check-spec-conflicts/index.ts`
Lightweight function for the agent builder UI. Takes `project_id` + `updated_fields`, loads current spec, uses Gemini Flash to check for internal contradictions between the proposed manual edits and existing rules. Returns `{ conflicts: [{field, description, severity, suggestion}] }`.

## Frontend Changes

### New component: `PendingChangesReview.tsx`
- Fetches `pending_spec_changes` where `status = 'pending'` for the project
- Shows each as a card: conflict type badge, field name, current vs proposed values (red/green diff), conflict description, impact summary, source
- Approve button: patches `agent_specs` directly, updates status to 'approved', logs to `spec_change_log`, resyncs Retell
- Reject button: updates status to 'rejected' with optional notes

### New component: `SpecChangeLog.tsx`
- Fetches `spec_change_log` for the project, ordered by `created_at DESC`
- Timeline view: timestamp, source badge, field changed, old → new values
- Conflict flag indicator when `conflict_detected = true`
- Filter by source, field, or conflicts only

### Update `UniversityPage.tsx`
- Import and render `PendingChangesReview` at the top when pending changes exist
- Import and render `SpecChangeLog` as a collapsible section
- Update feedback response handling: show conflict alert toast when `held_for_review` is returned

### Update `LiveSimulationChat.tsx`
- Update feedback response handling to show conflict alert toast when `held_for_review` is returned

### Update `SimulationTraining.tsx`
- In the auto-apply loop, handle `held_for_review` responses — track held changes separately and show summary

### Update `EditAgentPage.tsx`
- Before saving spec edits, call `check-spec-conflicts` edge function
- If conflicts returned, show a confirmation dialog listing the contradictions before proceeding
- On save success, log to `spec_change_log` via a direct insert or edge function call

## Files Changed

| File | Action |
|------|--------|
| Migration SQL | Create `spec_change_log` + `pending_spec_changes` tables with RLS |
| `supabase/functions/apply-audit-recommendation/index.ts` | Add conflict detection + logging |
| `supabase/functions/check-spec-conflicts/index.ts` | New lightweight conflict checker for manual edits |
| `supabase/config.toml` | Add `check-spec-conflicts` function config |
| `src/components/PendingChangesReview.tsx` | New review UI component |
| `src/components/SpecChangeLog.tsx` | New change log timeline component |
| `src/pages/UniversityPage.tsx` | Integrate pending changes + change log + conflict toasts |
| `src/components/LiveSimulationChat.tsx` | Handle `held_for_review` response |
| `src/components/SimulationTraining.tsx` | Handle `held_for_review` in auto-apply loop |
| `src/pages/EditAgentPage.tsx` | Pre-save conflict check + confirmation dialog |

