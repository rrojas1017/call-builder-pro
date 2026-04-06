
ALTER TABLE public.campaigns
  ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN schedule_days text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri}'::text[],
  ADD COLUMN schedule_start_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN schedule_end_time text NOT NULL DEFAULT '17:00',
  ADD COLUMN schedule_timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN schedule_day_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
