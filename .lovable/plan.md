

## Fix "contacts_status_check" Constraint Error on Force Cancel

### Problem

The `contacts` table has a database CHECK constraint that only allows these status values:
`queued`, `calling`, `completed`, `failed`, `no_answer`, `voicemail`, `busy`

But the application uses several additional statuses:
- `cancelled` (force cancel feature)
- `dnc` (do not call)
- `disconnected`
- `call_me_later`
- `not_available`

When you click "Force Cancel", it tries to set `status = 'cancelled'` which violates the constraint.

### Fix

**Database migration:** Drop the old CHECK constraint and replace it with one that includes all statuses the system uses:

```sql
ALTER TABLE contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check 
  CHECK (status = ANY (ARRAY[
    'queued', 'calling', 'completed', 'failed', 
    'no_answer', 'voicemail', 'busy',
    'cancelled', 'dnc', 'disconnected', 
    'call_me_later', 'not_available'
  ]));
```

No code changes needed -- the UI and webhooks already handle all these statuses correctly. The constraint is the only thing blocking them.

### Files changed

| Change | Detail |
|---|---|
| Database migration | Update `contacts_status_check` to include all valid statuses |

