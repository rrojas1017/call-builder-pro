ALTER TABLE campaigns
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN redial_delay_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN redial_statuses text[] NOT NULL DEFAULT '{voicemail,no_answer,busy}';