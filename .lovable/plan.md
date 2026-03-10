

## Feedback System Analysis

### What Works
1. **UI is correct** — The feedback input appears for completed/cancelled contacts with text + voice recording support
2. **Saving works** — Feedback is saved to `test_run_contacts.user_feedback` in the database
3. **Evaluate-call reads it** — The `evaluate-call` function fetches `user_feedback` and injects it as a high-priority block into the AI evaluation prompt (lines 170-185)

### The Critical Timing Problem

**The feedback is never actually consumed by the AI.** Here's why:

1. Call ends → Retell webhook fires → `evaluate-call` is triggered **immediately**
2. At this point, `user_feedback` is `null` because the user hasn't had time to type anything
3. User types feedback and saves it → stored in DB ✓
4. **No re-evaluation is ever triggered** — there's no button or mechanism to re-run the evaluation with the new feedback

So the feedback sits in the database but the AI evaluation has already completed without it. The toast message "Your feedback will be included in the next evaluation" is misleading — there is no "next evaluation" for that call.

### Fix Plan

**File: `src/pages/UniversityPage.tsx`**

After `handleSaveFeedback` successfully saves, automatically trigger a re-evaluation by calling `evaluate-call` with the contact's associated `call_id`. This requires:

1. In `handleSaveFeedback`, after the DB update succeeds, invoke the `evaluate-call` edge function with the call ID and test_run_contact_id
2. To get the call_id, query the `calls` table using the contact's `retell_call_id` — or simpler, pass `test_run_contact_id` to `evaluate-call` which already looks up the call
3. Clear the current evaluation display and show the "Grading in Progress" state while re-evaluation runs
4. Poll or subscribe to the contact for the updated evaluation

Specifically in `handleSaveFeedback` (around line 813):
- After `setSavedFeedback(...)`, invoke `supabase.functions.invoke("evaluate-call", { body: { test_run_contact_id: contact.id } })`
- But `evaluate-call` requires a `call_id`. So we need to look up the call by `retell_call_id` from the contact, or modify `evaluate-call` to accept `test_run_contact_id` alone

**File: `supabase/functions/evaluate-call/index.ts`**

Add a fallback lookup: if `call_id` is not provided but `test_run_contact_id` is, look up the call via `retell_call_id` matching. This way the frontend can trigger re-evaluation with just the contact ID.

### Alternative Simpler Approach

Instead of re-evaluating, route the feedback directly through `apply-audit-recommendation` (which already maps natural language feedback to agent spec fields). This would:
- Save the feedback to DB ✓ (already done)
- Immediately apply it as an improvement to the agent spec

Add to `handleSaveFeedback`:
```typescript
await supabase.functions.invoke("apply-audit-recommendation", {
  body: { project_id: projectId, recommendation: feedbackText.trim(), category: "user_feedback" }
});
```

This matches the pattern already used in `LiveSimulationChat.tsx` (line 96-99) where inline coaching feedback is routed through the same pipeline.

### Recommended Approach: Both

1. **Immediately apply** the feedback via `apply-audit-recommendation` so the agent learns right away
2. **Optionally re-evaluate** so the user can see updated scores reflecting their feedback

This is a small change — ~10 lines added to `handleSaveFeedback` in `UniversityPage.tsx`.

