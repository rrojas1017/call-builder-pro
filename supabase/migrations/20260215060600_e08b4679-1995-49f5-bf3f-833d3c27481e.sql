
CREATE TABLE public.sidebar_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sections jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sidebar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sidebar config"
  ON public.sidebar_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Super admins can manage sidebar config"
  ON public.sidebar_config FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
