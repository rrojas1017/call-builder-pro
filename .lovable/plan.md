

## Add Credits to Appendify Organization

### Problem
The `run-test-run` edge function checks `organizations.credits_balance` before placing calls. Appendify currently has **0 credits** in the database, so all test runs are blocked with a 402 error — even though your Bland AI account has its own credit balance.

### Fix
Run a single database update to set a credit balance for Appendify:

```sql
UPDATE organizations
SET credits_balance = 1000
WHERE name = 'Appendify';
```

This sets a $1,000 balance, which is enough for thousands of test calls. Since Bland charges against your Bland account directly, this internal balance is just a gate — it doesn't represent real money unless you wire up the Stripe top-up flow to enforce it.

### What changes
- One SQL statement executed via a database migration
- No code changes, no edge function changes, no frontend changes

### Optional: Remove the credit gate entirely
If you don't want internal credit tracking at all (since Bland has its own billing), we could also remove the credit check from `run-test-run/index.ts` and `start-campaign/index.ts`. That way calls always go through as long as Bland accepts them. This would be a separate, small code change if you prefer that approach.

