CREATE OR REPLACE FUNCTION public.increment_knowledge_usage(entry_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE agent_knowledge
  SET usage_count = usage_count + 1
  WHERE id = ANY(entry_ids);
END;
$$;