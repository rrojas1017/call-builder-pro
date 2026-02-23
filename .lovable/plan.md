

# Campaign Management: Delete, Edit, and Reset

## Overview
Add full campaign lifecycle management (edit, reset, delete) while preserving all historical data in the CRM and calls tables. Deleting a campaign removes the campaign configuration and its contacts, but CRM records and call history remain untouched as historical data.

## What Changes

### 1. Database: Set Foreign Keys to Allow Orphaned Historical Data
Currently, `contacts.campaign_id` and `calls.campaign_id` reference the campaigns table. To allow campaign deletion while preserving call history:
- Set `calls.campaign_id` to `SET NULL` on delete (calls remain as historical records with a null campaign reference)
- Delete `contacts` when campaign is deleted (they are campaign-specific operational data, not historical)
- Delete `campaign_lists` when campaign is deleted

The `crm_records` table stores `campaign_ids` as a UUID array with no FK -- already safe.

### 2. Campaign Detail Page: Add Edit and Reset Actions

**Edit Campaign** (for draft/paused campaigns):
- Inline-editable fields: name, max concurrent calls, max attempts, redial delay, retryable statuses, HIPAA toggle, test mode toggle, voicemail message
- Save button to persist changes
- Cannot change agent or lists after creation (would require re-importing contacts)

**Reset Campaign** (for paused/completed campaigns):
- Resets all contacts back to "queued" status with attempts = 0
- Clears called_at, bland_call_id, retell_call_id, last_error
- Sets campaign status back to "draft"
- Does NOT touch calls table or CRM records (historical data preserved)
- Requires confirmation dialog with clear warning

**Delete Campaign** (any status except running):
- Deletes contacts, campaign_lists, then the campaign itself
- Calls are preserved (campaign_id set to null via cascade)
- CRM records untouched (they store campaign_ids independently)
- Requires confirmation dialog
- Cannot delete while campaign is running (must pause first)

### 3. Campaigns List Page: Add Delete Action
- Add a trash icon button next to each campaign in the list view
- Confirmation dialog before deletion
- Disabled for running campaigns

## Technical Details

### Migration
```text
-- Update FK on calls.campaign_id to SET NULL on delete
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_campaign_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Update FK on contacts.campaign_id to CASCADE delete
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_campaign_id_fkey;
ALTER TABLE contacts ADD CONSTRAINT contacts_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Update FK on campaign_lists.campaign_id to CASCADE delete
ALTER TABLE campaign_lists DROP CONSTRAINT IF EXISTS campaign_lists_campaign_id_fkey;
ALTER TABLE campaign_lists ADD CONSTRAINT campaign_lists_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
```

### Delete logic (frontend)
Simply delete the campaign row -- cascades handle contacts and campaign_lists, calls get nullified.

### Reset logic (frontend)
```text
-- Reset all contacts for this campaign
UPDATE contacts SET status = 'queued', attempts = 0, called_at = NULL, 
  retell_call_id = NULL, bland_call_id = NULL, last_error = NULL
WHERE campaign_id = ?;

-- Reset campaign status
UPDATE campaigns SET status = 'draft' WHERE id = ?;
```

### Edit logic (frontend)
Standard UPDATE on the campaigns table for editable fields.

### Files to modify
- New migration for FK cascade rules
- `src/pages/CampaignDetailPage.tsx` -- add edit form, reset button, improve delete handler
- `src/pages/CampaignsPage.tsx` -- add delete button with confirmation to list view

## Implementation Order
1. Database migration (FK cascade rules)
2. Update CampaignDetailPage with edit, reset, and improved delete
3. Update CampaignsPage list with delete action

