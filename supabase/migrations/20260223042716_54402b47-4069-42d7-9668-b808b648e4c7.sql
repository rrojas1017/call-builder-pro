
-- Update FK on calls.campaign_id to SET NULL on delete (preserve call history)
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_campaign_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Update FK on contacts.campaign_id to CASCADE delete (operational data)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_campaign_id_fkey;
ALTER TABLE contacts ADD CONSTRAINT contacts_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Update FK on campaign_lists.campaign_id to CASCADE delete
ALTER TABLE campaign_lists DROP CONSTRAINT IF EXISTS campaign_lists_campaign_id_fkey;
ALTER TABLE campaign_lists ADD CONSTRAINT campaign_lists_campaign_id_fkey 
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
