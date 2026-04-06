
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT upper(substr(md5(gen_random_uuid()::text), 1, 6))
$$;
