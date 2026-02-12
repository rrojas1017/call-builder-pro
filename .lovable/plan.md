

# Fix: Invalid transfer_phone_number Error

## Root Cause
The `transfer_phone_number` field in the database contains qualification/disqualification rule text (e.g., "Users looking to travel in less than 14 days...") instead of actual phone numbers. When `transfer_required` is `true`, this text is sent to the Bland API as a phone number, causing the "Invalid transfer_phone_number" error.

## Fix

### 1. Validate transfer_phone_number before sending to Bland API
In `supabase/functions/run-test-run/index.ts`, add a phone number format check before including `transfer_phone_number` in the Bland payload. Only send it if it looks like an actual phone number (digits, starts with + or contains 10+ digits).

Change the existing block:
```
if (spec?.transfer_required && spec?.transfer_phone_number) {
  blandPayload.transfer_phone_number = spec.transfer_phone_number;
}
```
To:
```
if (spec?.transfer_required && spec?.transfer_phone_number) {
  const digits = spec.transfer_phone_number.replace(/\D/g, "");
  if (digits.length >= 10) {
    blandPayload.transfer_phone_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
  }
}
```

This silently skips invalid transfer numbers so the call still goes through -- it just won't attempt a transfer.

### 2. Fix the data at the source (generate-spec or save-wizard-answers)
The wizard is storing rule descriptions in the `transfer_phone_number` column. Review the `save-wizard-answers` or `generate-spec` edge function to ensure qualification/disqualification rules go into `qualification_rules` / `disqualification_rules` columns instead, and `transfer_phone_number` only stores an actual phone number.

### Files to modify:
- **`supabase/functions/run-test-run/index.ts`** -- add phone validation guard (immediate fix)
- **`supabase/functions/generate-spec/index.ts`** or **`supabase/functions/save-wizard-answers/index.ts`** -- review and fix field mapping so rule text doesn't end up in `transfer_phone_number` (root cause fix)
