import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

interface OrgContextValue {
  activeOrgId: string | null;
  ownOrgId: string | null;
  orgName: string | null;
  isImpersonating: boolean;
  switchOrg: (orgId: string, name: string) => void;
  resetOrg: () => void;
  loading: boolean;
  role: string | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  activeOrgId: null,
  ownOrgId: null,
  orgName: null,
  isImpersonating: false,
  switchOrg: () => {},
  resetOrg: () => {},
  loading: true,
  role: null,
  isSuperAdmin: false,
  isAdmin: false,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { role, loading: roleLoading, isSuperAdmin, isAdmin } = useUserRole();
  const [ownOrgId, setOwnOrgId] = useState<string | null>(null);
  const [ownOrgName, setOwnOrgName] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [activeOrgName, setActiveOrgName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOwnOrgId(null);
      setActiveOrgId(null);
      setProfileLoading(false);
      return;
    }

    // Reset loading state when user changes to prevent flash of "no org"
    setProfileLoading(true);

    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) {
        setOwnOrgId(profile.org_id);
        setActiveOrgId(profile.org_id);

        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.org_id)
          .single();
        setOwnOrgName(org?.name ?? null);
        setActiveOrgName(org?.name ?? null);
      }
      setProfileLoading(false);
    };

    load();
  }, [user]);

  const switchOrg = (orgId: string, name: string) => {
    setActiveOrgId(orgId);
    setActiveOrgName(name);
  };

  const resetOrg = () => {
    setActiveOrgId(ownOrgId);
    setActiveOrgName(ownOrgName);
  };

  const isImpersonating = !!(activeOrgId && ownOrgId && activeOrgId !== ownOrgId);

  return (
    <OrgContext.Provider
      value={{
        activeOrgId,
        ownOrgId,
        orgName: activeOrgName,
        isImpersonating,
        switchOrg,
        resetOrg,
        loading: profileLoading || roleLoading,
        role,
        isSuperAdmin,
        isAdmin,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrgContext() {
  return useContext(OrgContext);
}
