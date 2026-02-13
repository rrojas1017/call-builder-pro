

## Update BLAND_API_KEY and Verify Connection

### Step 1: Update the Secret
Save the new Bland API key (`org_a31821cead...`) as the `BLAND_API_KEY` secret in the project, replacing the old/invalid key.

### Step 2: Verify the Authorization Header Format
Review how the Bland API key is being sent in the edge functions. Currently the code sends:
```
Authorization: blandApiKey
```
Bland.ai may expect a different format (e.g., no prefix, or a specific prefix). If the 403 persists after updating the key, we will check the Bland API docs for the correct header format and update accordingly.

### Step 3: Run a Test Call
Trigger a test call via the edge function to confirm the 403 error is resolved and calls are initiated successfully.

### Technical Details
- **Files involved**: `supabase/functions/run-test-run/index.ts`, `supabase/functions/tick-campaign/index.ts`
- **Secret to update**: `BLAND_API_KEY`
- **Validation**: Check edge function logs after test call for successful Bland API response

