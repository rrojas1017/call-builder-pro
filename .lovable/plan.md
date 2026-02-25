

# Reset Jason Fine's Password

## What will happen
Create a temporary backend function to reset Jason Fine's password to `Test123!`, then remove it after execution.

## Technical Details

**User:** Jason Fine (`e520aced-51f5-4b79-9e96-ce578133fa51`) — `jfine@coverallhc.com`

**Steps:**
1. Create a temporary edge function `reset-password-temp` that calls the admin API's `updateUserById` with the new password
2. Invoke it to reset the password
3. Delete the function after confirming success

The function will use the service role key to call `auth.admin.updateUserById(userId, { password })` — a standard admin operation.

