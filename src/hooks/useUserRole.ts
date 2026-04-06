import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "analyst" | "viewer";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish before doing anything
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (!cancelled) {
        setRole((data?.role as AppRole) ?? "viewer");
        setLoading(false);
      }
    };

    fetchRole();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return {
    role,
    loading,
    isSuperAdmin: role === "super_admin",
    isAdmin: role === "admin" || role === "super_admin",
  };
}
