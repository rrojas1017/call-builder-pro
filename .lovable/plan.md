

## Fix: Enable Call Transfer for ACA Qualifier Agent

### Problem
The ACA Qualifier agent has `transfer_required` set to `false` in the database, so the transfer phone number (`3054332275`) is never sent to Bland AI. The call completes without transferring.

### Solution (2 parts)

**1. Fix the database value**
Run a SQL migration to set `transfer_required = true` for the ACA Qualifier agent (`66138346-0a1f-4c5f-b30b-fab52f15d3a3`).

**2. Normalize the transfer phone number**
The stored number `3054332275` is 10 digits without a country code. The code already handles this normalization (line 249-251), adding `+1` prefix. No code change needed here.

### Verification
After the database update, run a Quick Test call to confirm the agent transfers the call to +13054332275.

### Technical Details
- **Table**: `agent_specs`
- **Column**: `transfer_required` (change from `false` to `true`)
- **Filter**: `project_id = '66138346-0a1f-4c5f-b30b-fab52f15d3a3'`
- No code changes required -- the existing transfer logic in `run-test-run` is correct once the flag is enabled

