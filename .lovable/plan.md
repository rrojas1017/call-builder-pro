

# Fix: Redeploy evaluate-call and verify live transcription

## Problem

Two related issues:

1. **evaluate-call not redeployed**: The logs confirm the deployed version is still calling `callClaude` (Anthropic), which fails with "credit balance too low". The code was updated to use Gemini but the function was never actually redeployed with the new code. This blocks all post-call evaluations and prevents the evolution graph from appearing.

2. **Live transcription may not trigger**: The `LiveCallMonitor` component only renders when `running && contact?.retell_call_id` is truthy. If the `retell_call_id` isn't populated on the contact record quickly enough after the call starts, the monitor won't appear.

## Solution

### Step 1: Redeploy evaluate-call
The code already has `provider: "gemini"` with `google/gemini-2.5-flash`. Simply redeploying the function will fix all evaluation failures.

### Step 2: Redeploy live-call-stream
Ensure this function is also on the latest deployed version to prevent any stale code issues.

### Step 3: Verify retell_call_id population
Check that the test call flow properly sets `retell_call_id` on the test contact so the `LiveCallMonitor` renders. If there's a timing issue where the call starts before the ID is saved, we may need to add a brief refetch loop.

## Expected Result
- Evaluations will complete successfully using the Lovable AI gateway
- The evolution graph will populate with humanness/naturalness scores
- Live transcription will display during active test calls
