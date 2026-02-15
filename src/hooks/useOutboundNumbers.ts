import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";

interface OutboundNumber {
  id: string;
  phone_number: string;
  label: string | null;
  status: string;
}

export function useOutboundNumbers() {
  const { activeOrgId } = useOrgContext();
  const [numbers, setNumbers] = useState<OutboundNumber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    const load = async () => {
      const { data } = await supabase
        .from("outbound_numbers")
        .select("id, phone_number, label, status")
        .eq("org_id", activeOrgId)
        .eq("status", "trusted")
        .order("created_at", { ascending: false });
      setNumbers((data as any[]) || []);
      setLoading(false);
    };
    load();
  }, [activeOrgId]);

  return { numbers, loading };
}
