
-- Add short_id columns
ALTER TABLE dial_lists ADD COLUMN short_id text;
ALTER TABLE campaigns ADD COLUMN short_id text;

-- Function to generate list short ID per org
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
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_list_short_id
  BEFORE INSERT ON dial_lists
  FOR EACH ROW EXECUTE FUNCTION generate_list_short_id();

-- Function to generate campaign short ID per org
CREATE OR REPLACE FUNCTION generate_campaign_short_id()
RETURNS trigger AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(short_id FROM 5) AS integer)
  ), 0) + 1 INTO next_num
  FROM campaigns WHERE project_id IN (
    SELECT id FROM agent_projects WHERE org_id = (
      SELECT org_id FROM agent_projects WHERE id = NEW.project_id LIMIT 1
    )
  ) AND short_id IS NOT NULL;
  NEW.short_id := 'CMP-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_campaign_short_id
  BEFORE INSERT ON campaigns
  FOR EACH ROW EXECUTE FUNCTION generate_campaign_short_id();

-- Backfill existing dial_lists
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at) AS rn
  FROM dial_lists WHERE short_id IS NULL
)
UPDATE dial_lists SET short_id = 'LST-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered WHERE dial_lists.id = numbered.id;

-- Backfill existing campaigns
WITH numbered AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM campaigns c WHERE c.short_id IS NULL
)
UPDATE campaigns SET short_id = 'CMP-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered WHERE campaigns.id = numbered.id;
