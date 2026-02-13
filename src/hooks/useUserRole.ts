import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "analyst" | "viewer";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      setRole((data?.role as AppRole) ?? "viewer");
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  return {
    role,
    loading,
    isSuperAdmin: role === "super_admin",
    isAdmin: role === "admin" || role === "super_admin",
  };
}
