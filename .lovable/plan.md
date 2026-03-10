

# Is the AI Learning from Training? — Findings & Fix

## Current State: Partially Working

The learning pipeline **is wired up end-to-end**, but has one critical bug that undermines the "Live Practice" flow:

### What Works
- **Auto-Training pipeline** (`auto-train`): Runs simulate → evaluate → auto-apply fixes loop correctly. Each round runs new simulations, evaluates them, and applies critical/important recommendations back to the agent spec.
- **Evaluation pipeline** (`evaluate-call`): Correctly scores calls, auto-applies humanness suggestions, pronunciation fixes, and recommended improvements via `apply-improvement` with version tracking.
- **Success learning** (`learn-from-success`): Triggers every 5th qualified call, extracts winning patterns, saves to `agent_knowledge`.
- **Score snapshots**: Tracked per version in `score_snapshots` table for trend visibility.

### What's Broken: "Save & Learn" Discards the Actual Conversation

When a user watches a Live Simulation and clicks **"Save & Learn"**, the code at line 207 calls `simulate-call` — which **runs an entirely new AI-vs-AI conversation** instead of evaluating the one the user just observed. The conversation they watched is thrown away; the evaluation and learning happen on a conversation they never saw.

## Fix

### `src/components/LiveSimulationChat.tsx` — `handleSaveAndLearn`

Instead of calling `simulate-call` (which generates a new conversation), the function should:

1. **Build the transcript** from the existing `messages` array (already done on line 202-204).
2. **Save the transcript as a call record** by inserting directly into the `calls` table via Supabase client.
3. **Call `evaluate-call`** with that call ID to score and auto-apply improvements.

This way the actual conversation the user watched is what gets evaluated and learned from.

```text
Current flow:
  User watches simulation → clicks Save & Learn → NEW simulation runs → that gets evaluated
  (user's conversation is discarded)

Fixed flow:
  User watches simulation → clicks Save & Learn → THAT conversation is saved → evaluated → fixes applied
```

### Implementation Details
- Replace the `supabase.functions.invoke("simulate-call")` call with:
  1. Insert the transcript into `calls` table (org_id from context, project_id, voice_provider="simulated", transcript from messages)
  2. Call `supabase.functions.invoke("evaluate-call", { body: { call_id } })`
  3. Apply critical recommendations from the evaluation result (existing logic on lines 222-241 stays the same)

### Scope
One file change: `src/components/LiveSimulationChat.tsx` — rewrite `handleSaveAndLearn` (~30 lines).

