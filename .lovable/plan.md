
# Fix: Live Monitor, Transfer, and Results Feedback

## Issue 1: Live Monitor Shows Empty Transcripts

**Root Cause**: The `live-call-stream` function polls Retell's `GET /v2/get-call/{call_id}` endpoint, but during an active call, the `transcript` and `transcript_object` fields are empty. Retell only populates these after the call ends. For live transcripts, Retell provides data in the `transcript_with_tool_calls` array field during the call.

**Fix**: Update `supabase/functions/live-call-stream/index.ts` to also check the `transcript_with_tool_calls` field which Retell populates during live calls. This is an array of objects with `role` and `content` fields.

```text
// After checking transcript and transcript_object, also check:
if (Array.isArray(data.transcript_with_tool_calls)) {
  // Parse live transcript entries
}
```

## Issue 2: Agent Said "Ashley" Instead of "Alex" and Didn't Transfer

**Root Cause (Name)**: The `opening_line` in `agent_specs` still contains the hardcoded text "this is Ashley". The safeguard we just added only fires on FUTURE saves. The existing database record was never corrected. Additionally, `run-test-run` does NOT sync the `begin_message` to the Retell LLM (unlike `tick-campaign` which does). So whatever `begin_message` was last set on the Retell LLM persists.

**Root Cause (Transfer)**: The `run-test-run` function correctly pushes the `transfer_call` tool to the LLM's `general_tools`, so the transfer capability IS available. However, the agent's prompt may not be instructing it clearly enough to trigger the transfer at the right moment. This is a prompt/LLM behavior issue, not a code bug. The transfer tool IS being injected.

**Fix**:
1. In `run-test-run`, add `begin_message` sync (matching what `tick-campaign` already does): resolve the opening line with template variables and push it to the Retell LLM.
2. Fix the existing `opening_line` in the database to replace "Ashley" with the `{{agent_name}}` placeholder.

## Issue 3: Results/Evaluation Not Appearing in UI

**Root Cause**: Race condition. The webhook flow is:
1. `call_ended` webhook fires, sets `test_run_contacts.status = "completed"`
2. This triggers the UI's realtime subscription, which sees `status = completed` and sets `running = false`
3. When `running = false`, polling stops
4. But `evaluate-call` is fired ASYNC after step 1 and writes the `evaluation` field later
5. By the time evaluation is written, the UI has already stopped polling

**Fix**: In `UniversityPage.tsx`, keep polling for a short grace period after the call completes, waiting for the `evaluation` field to be populated. Only stop polling once evaluation is present (or after a timeout like 60 seconds).

## Files to Modify

### `supabase/functions/live-call-stream/index.ts`
- Add parsing for `transcript_with_tool_calls` array (Retell's live transcript field)

### `supabase/functions/run-test-run/index.ts`
- After injecting `general_prompt` and `general_tools` into the LLM, also set `begin_message` with the resolved opening line (template vars replaced), matching `tick-campaign` behavior

### `src/pages/UniversityPage.tsx`
- Modify the realtime subscription effect: when status becomes "completed" but evaluation is null, continue polling for up to 60 seconds waiting for evaluation data
- Show a "Grading in progress..." indicator while waiting

### Database Fix (one-time)
- Run a SQL update to replace "Ashley" with `{{agent_name}}` in the existing `opening_line` for the affected agent spec

## Technical Details

### Live Transcript Parsing (live-call-stream)
```text
// New block after existing transcript_object check:
if (transcripts.length === 0 && Array.isArray(data.transcript_with_tool_calls)) {
  for (const entry of data.transcript_with_tool_calls) {
    if (entry.role && entry.content) {
      transcripts.push({
        id: `live-${transcripts.length}`,
        text: entry.content,
        role: entry.role === "agent" ? "agent" : "caller",
      });
    }
  }
}
```

### begin_message Sync (run-test-run)
```text
// After general_prompt injection, add:
const agentName = spec?.persona_name || "Agent";
const resolvedOpening = spec?.opening_line
  ? spec.opening_line.replace(/\{\{agent_name\}\}/gi, agentName)
  : null;

if (resolvedOpening) {
  llmPatchBody.begin_message = resolvedOpening;
}
```

### Polling Grace Period (UniversityPage)
```text
// In the fetchContact callback, change the stop condition from:
if (!["queued", "calling"].includes(data.status))
// To:
if (!["queued", "calling"].includes(data.status) && data.evaluation != null)
// With a 60-second timeout fallback
```
