

## Fix Bland API 403 Error -- Update API Base URL

### Problem
The edge functions are calling `https://api.bland.ai/v1/calls`, but Bland's documentation shows the correct endpoint is `https://us.api.bland.ai/v1/calls`. The old URL returns a 403 Forbidden with an HTML error page instead of JSON.

### Solution
Update the Bland API base URL in both edge functions that make outbound calls:

1. **`supabase/functions/run-test-run/index.ts`** (line 255): Change `https://api.bland.ai/v1/calls` to `https://us.api.bland.ai/v1/calls`
2. **`supabase/functions/tick-campaign/index.ts`** (line 112): Change `https://api.bland.ai/v1/calls` to `https://us.api.bland.ai/v1/calls`

### Verification
After deploying, run a Quick Test call to confirm the 403 is resolved and calls are placed successfully.

### Technical Details
- The `Authorization` header format (`Authorization: <api_key>`) is already correct per Bland's docs
- Only the base URL needs to change from `api.bland.ai` to `us.api.bland.ai`
- Two files need this one-line change each

