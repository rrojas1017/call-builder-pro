

# Feedback Verification System — "Prove It Works"

## The Problem

When jfine gives feedback (e.g., "use a name transition"), the system applies it to the agent spec and syncs to Retell, but there's **no verification step** that proves the agent actually changed its behavior. The user has no way to confirm the feedback took effect other than running another call manually and hoping to notice the difference.

## Current Flow (Missing Link)

```text
User gives feedback → apply-audit-recommendation → spec updated → Retell synced → ??? → User hopes it worked
```

## Proposed Flow

```text
User gives feedback → spec updated → Retell synced → AUTO-VERIFICATION SIM → side-by-side before/after shown to user
```

## What We Build

### 1. Auto-Verification Simulation (Edge Function Enhancement)

After feedback is applied successfully in `apply-audit-recommendation`, automatically trigger a short verification simulation (3-5 turns) using `simulate-call` that specifically tests the feedback scenario. Return the verification result alongside the apply response.

**New edge function: `verify-feedback`**
- Takes `project_id`, `feedback_text`, and `field_changed`
- Runs a quick 5-turn simulation with a customer persona designed to trigger the specific behavior the feedback addresses
- Uses AI to check: "Does the agent's behavior in this simulation reflect the feedback: '{feedback_text}'?"
- Returns a `verified: true/false` with evidence quote from the transcript

### 2. Feedback Audit Trail UI (UniversityPage Enhancement)

Add a **"Feedback History"** section or enhance the existing feedback display to show:
- The feedback text given
- What field was changed (from `apply-audit-recommendation` response)
- Whether it was synced to the live agent
- Verification status: "Verified ✅" / "Pending verification" / "Not verified ⚠️"
- A "Verify Now" button that triggers a quick simulation to test the feedback

### 3. Enhanced Feedback Response in UniversityPage

Currently the toast just says "Your feedback was applied to the agent's configuration." Update the flow to:
- Show exactly **what changed** (field name + before/after values from the patch)
- Show sync status (synced to live agent or not)
- Offer a "Run Verification" button that runs a quick sim to prove it

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/verify-feedback/index.ts` | New function: runs a targeted simulation and AI-checks if the feedback behavior is present |
| `src/pages/UniversityPage.tsx` | Enhanced feedback response showing field changed, before/after, sync status, and "Verify" button |
| `src/components/LiveSimulationChat.tsx` | Same enhancement for inline coaching feedback |

### How Verification Works

1. After `apply-audit-recommendation` returns successfully with `field`, `patch`, and `synced_to_retell`
2. User sees: "✅ Applied: Updated `opening_line` — Synced to live agent"
3. User can click "Verify" which calls `verify-feedback`
4. `verify-feedback` runs a 5-turn sim, then asks AI: "Given this feedback: '{text}', does the agent in this transcript demonstrate the requested behavior?"
5. Result shown: "Verified ✅ — Agent now asks for first name in turn 1" or "Not verified ⚠️ — Agent did not demonstrate the requested change"

