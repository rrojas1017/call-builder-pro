

# Conversation Registry, Export, and Readable IDs

## What exists today
- **CRM page** already captures extracted data (name, consent, qualified, transferred, custom_fields) from calls via the webhook. It has CSV export but lacks transcript/summary export and campaign/list filtering in export.
- **Calls page** has basic CSV export (ID, agent, campaign, direction, outcome, duration, score) but no transcript, extracted data, or list-level filtering.
- **Campaign Detail page** shows contacts with transcripts, extracted data, evaluation scores in a drawer -- but no bulk export.
- **Lists** and **Campaigns** use UUIDs internally but don't display human-readable short IDs.
- The webhook already captures `extracted_data` and `summary` with call insights. The data capture pipeline is working.

## What we'll build

### 1. Human-readable short IDs for Lists and Campaigns
- Add a `short_id` column (text, auto-generated) to both `dial_lists` and `campaigns` tables via migration.
- Generate short IDs like `LST-0001`, `CMP-0001` using a database trigger that auto-increments per org.
- Display these IDs prominently on list cards, campaign cards, and detail pages.

### 2. Enhanced Conversation Registry (upgrade Calls page)
- Add transcript and extracted data columns to the CSV export on the Calls page.
- Add a "List" filter dropdown so users can filter calls by the originating list.
- Include `call_summary`, `extracted_data` (flattened), and `transcript` in the export.
- Add campaign short ID and list short ID to the export.

### 3. Campaign-level export with full conversation data
- Add an "Export All Conversations" button on the Campaign Detail page.
- Export includes: contact name, phone, outcome, duration, transcript, extracted data (all fields flattened), evaluation scores, recording URL, list short ID.
- CSV download with campaign short ID in the filename.

### 4. Ensure all extracted insights are captured (verification)
- The webhook (`receive-retell-webhook`) already saves `extracted_data` and `summary` to the `calls` table. The `upsert_crm_record` function already pushes key fields to CRM. No backend changes needed for data capture -- the pipeline works. We'll verify and document this.

## Technical changes

### Database migration
```sql
-- Add short_id to dial_lists and campaigns
ALTER TABLE dial_lists ADD COLUMN short_id text;
ALTER TABLE campaigns ADD COLUMN short_id text;

-- Function to generate next short ID
CREATE OR REPLACE FUNCTION generate_list_short_id()
RETURNS trigger AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(short_id FROM 5) AS integer)
  ), 0) + 1 INTO next_num
  FROM dial_lists WHERE org_id = NEW.org_id AND short_id IS NOT NULL;
  NEW.short_id := 'LST-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_list_short_id
  BEFORE INSERT ON dial_lists
  FOR EACH ROW EXECUTE FUNCTION generate_list_short_id();

-- Same pattern for campaigns
CREATE OR REPLACE FUNCTION generate_campaign_short_id()
RETURNS trigger AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(short_id FROM 5) AS integer)
  ), 0) + 1 INTO next_num
  FROM campaigns WHERE project_id IN (
    SELECT id FROM agent_projects WHERE org_id = (
      SELECT org_id FROM agent_projects WHERE id = NEW.project_id
    )
  ) AND short_id IS NOT NULL;
  NEW.short_id := 'CMP-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_campaign_short_id
  BEFORE INSERT ON campaigns
  FOR EACH ROW EXECUTE FUNCTION generate_campaign_short_id();

-- Backfill existing records
UPDATE dial_lists SET short_id = 'LST-' || LPAD(ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at)::text, 4, '0') WHERE short_id IS NULL;
UPDATE campaigns SET short_id = 'CMP-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 4, '0') WHERE short_id IS NULL;
```

### File: `src/pages/ListsPage.tsx`
- Display `short_id` (e.g., "LST-0001") as a badge next to the list name on each card.

### File: `src/pages/CampaignsPage.tsx`
- Display `short_id` (e.g., "CMP-0001") next to campaign name on cards and detail header.

### File: `src/pages/CampaignDetailPage.tsx`
- Show campaign `short_id` in the header next to the name.
- Add "Export Conversations" button that exports all contacts + their call data (transcript, extracted data, scores, outcome, duration) as CSV.

### File: `src/pages/CallsPage.tsx`
- Expand the existing `exportCSV` function to include transcript, extracted_data fields (flattened), and call summary.
- Add a list filter dropdown (fetch lists and map contacts to lists via campaign_id).

### File: `src/pages/CRMPage.tsx`
- Add campaign and list filtering to the export to enable targeted exports.

