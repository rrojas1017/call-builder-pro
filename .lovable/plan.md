

# Add "Test Mode" Flag to Campaigns

## Overview
Add a `is_test` boolean flag to campaigns so users can mark a campaign as a test/dry-run. When a campaign is flagged as test, the webhook will skip CRM record upserts for its calls. University/test lab calls already skip CRM by default (they go through the test lab flow), but currently they DO upsert into CRM -- this will also be fixed.

## What Changes

### 1. Database: Add `is_test` column to `campaigns` table
- New column: `is_test boolean NOT NULL DEFAULT false`
- Simple migration, no data loss

### 2. Webhook: Skip CRM upsert for test campaigns and test lab calls
In `receive-retell-webhook/index.ts`:
- **Test lab flow** (line ~237): Remove the CRM upsert call entirely -- University calls should never populate CRM
- **Campaign flow** (line ~360): Before calling `upsertCrmRecord`, check if the campaign has `is_test = true`. If so, skip the CRM upsert

### 3. Campaign Creation UI
In `CampaignsPage.tsx`:
- Add a "Test Mode" toggle (similar to the HIPAA toggle) with a `FlaskConical` icon
- Description: "Mark this campaign as a test. Calls will not be recorded in the CRM."
- Pass `is_test` when inserting the campaign

### 4. Campaign List UI
- Show a "TEST" badge next to campaigns flagged as test (similar to the HIPAA badge)

## Technical Details

### Migration
```sql
ALTER TABLE campaigns ADD COLUMN is_test boolean NOT NULL DEFAULT false;
```

### Webhook logic change (pseudo)
```
-- Test lab flow: remove upsertCrmRecord call entirely

-- Campaign flow: before CRM upsert, check is_test
if (metadata.campaign_id) {
  const { data: camp } = await supabase
    .from("campaigns")
    .select("is_test")
    .eq("id", metadata.campaign_id)
    .single();
  if (!camp?.is_test) {
    await upsertCrmRecord(...);
  }
}
```

### Files to modify
- New migration for `is_test` column
- `supabase/functions/receive-retell-webhook/index.ts` -- skip CRM for test campaigns and test lab calls
- `src/pages/CampaignsPage.tsx` -- add test mode toggle and badge

