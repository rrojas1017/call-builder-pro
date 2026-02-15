

## Apply Audit Recommendations

Add "Apply" buttons next to each unified recommendation so that clicking one sends the recommendation text to an AI that translates it into a concrete spec patch, then applies it via the existing `apply-improvement` logic.

### Changes

| File | What |
|------|------|
| `supabase/functions/apply-audit-recommendation/index.ts` | **New edge function** -- receives `{ project_id, recommendation, category }`, uses Gemini Flash to map the recommendation text to a `{ field, suggested_value, reason }` patch, then applies it using the same logic as `apply-improvement` (version bump, dedup, domain guard, array merge). Returns success/failure + what changed. |
| `src/pages/TrainingAuditPage.tsx` | Add per-recommendation "Apply" button that calls the new function. Track applied state in a `Set`. Show green "Applied" badge after success. Add an "Apply All" bulk button at the top of the results section that sequentially applies all critical/important recommendations. |

### Edge Function: `apply-audit-recommendation`

1. Fetches current `agent_specs` for the project
2. Sends the recommendation + current spec summary to Gemini Flash with a tool-call schema:
   - Tool: `map_recommendation` with params `{ action: "patch_spec" | "add_knowledge" | "manual", field, suggested_value, reason }`
   - The AI maps natural language (e.g., "Lower temperature to 0.4 for compliance") into `{ field: "temperature", suggested_value: 0.4 }`
3. For `patch_spec`: applies the change using the same field-type logic from `apply-improvement` (text, json, bool, num fields, array merge, domain guard, dedup check)
4. For `add_knowledge`: inserts into `agent_knowledge` table
5. For `manual`: returns `{ success: false, manual: true, note: "..." }` so the UI can show "Manual review needed"
6. Records the change in the `improvements` table with version bump

### UI Changes

- Each recommendation row gets a small "Apply" button on the right side
- While applying: shows a spinner on that row
- On success: replaces button with a green "Applied" badge
- On failure: shows error toast, button remains
- "Apply All" button at the top of results: iterates through all critical + important recommendations, applies them sequentially, shows progress ("Applying 3/7..."), then a summary toast ("Applied 5/7, 2 need manual review")
- Applied state tracked via `Set<string>` keyed by recommendation text, persists within the session

### Safety

- Every patch goes through the existing domain-relevance guard (won't apply travel tips to an insurance agent)
- Every patch goes through the dedup check (warns if same field changed recently without improvement)
- Recommendations the AI can't map to a specific field return "manual" action and show "Manual review needed" instead of silently failing
- Array fields (humanization_notes, must_collect_fields) use merge strategy, not replace

