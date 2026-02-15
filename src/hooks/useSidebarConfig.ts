import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SidebarItem {
  label: string;
  path: string;
}

export interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

const DEFAULT_SECTIONS: SidebarSection[] = [
  {
    label: "BUILD",
    items: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Agents", path: "/agents" },
      { label: "Create Agent", path: "/create-agent" },
      { label: "Knowledge Base", path: "/knowledge" },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { label: "Campaigns", path: "/campaigns" },
      { label: "Lists", path: "/lists" },
      { label: "Phone Numbers", path: "/inbound" },
    ],
  },
  {
    label: "MONITOR",
    items: [
      { label: "Calls", path: "/calls" },
      { label: "University", path: "/test" },
      { label: "Pipeline Audit", path: "/training-audit" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Settings", path: "/settings" },
      { label: "Team", path: "/team" },
      { label: "Billing", path: "/billing" },
    ],
  },
];

const ADMIN_SECTION: SidebarSection = {
  label: "ADMIN",
  items: [
    { label: "Companies", path: "/admin/companies" },
    { label: "Audit Log", path: "/admin/audit" },
  ],
};

export function useSidebarConfig() {
  const { user } = useAuth();
  const [sections, setSections] = useState<SidebarSection[]>(DEFAULT_SECTIONS);
  const [adminSection] = useState<SidebarSection>(ADMIN_SECTION);
  const [loading, setLoading] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchConfig = async () => {
      const { data, error } = await (supabase
        .from("sidebar_config") as any)
        .select("id, sections")
        .limit(1)
        .maybeSingle();

      if (!error && data?.sections) {
        try {
          const dbSections = data.sections as unknown as SidebarSection[];
          // Filter out ADMIN section from DB config (it's handled separately)
          const filtered = dbSections.filter((s) => s.label !== "ADMIN");
          if (filtered.length > 0) {
            setSections(filtered);
          }
          setConfigId(data.id);
        } catch {
          // Fall back to defaults on parse error
        }
      }
      setLoading(false);
    };

    fetchConfig();
  }, [user]);

  const saveConfig = useCallback(
    async (newSections: SidebarSection[]) => {
      // Remove ADMIN from what we save
      const toSave = newSections.filter((s) => s.label !== "ADMIN");
      setSections(toSave);

      if (configId) {
        await (supabase
          .from("sidebar_config") as any)
          .update({
            sections: JSON.parse(JSON.stringify(toSave)),
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("id", configId);
      } else {
        const { data } = await (supabase
          .from("sidebar_config") as any)
          .insert({
            sections: JSON.parse(JSON.stringify(toSave)),
            updated_by: user?.id,
          })
          .select("id")
          .single();
        if (data) setConfigId((data as any).id);
      }
    },
    [configId, user]
  );

  return { sections, adminSection, loading, saveConfig, DEFAULT_SECTIONS };
}
