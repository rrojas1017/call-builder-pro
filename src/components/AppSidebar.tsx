import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, Bot, PlusCircle, Megaphone, Phone, PhoneIncoming,
  BookOpen, Settings, LogOut, Dumbbell, FileSpreadsheet, Users, CreditCard,
  Building2, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useOrgContext } from "@/hooks/useOrgContext";
import appendifyLogo from "@/assets/appendify-logo.png";

const navSections = [
  {
    label: "BUILD",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
      { label: "Agents", icon: Bot, path: "/agents" },
      { label: "Create Agent", icon: PlusCircle, path: "/create-agent" },
      { label: "Knowledge Base", icon: BookOpen, path: "/knowledge" },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { label: "Campaigns", icon: Megaphone, path: "/campaigns" },
      { label: "Lists", icon: FileSpreadsheet, path: "/lists" },
      { label: "Phone Numbers", icon: PhoneIncoming, path: "/inbound" },
    ],
  },
  {
    label: "MONITOR",
    items: [
      { label: "Calls", icon: Phone, path: "/calls" },
      { label: "Gym", icon: Dumbbell, path: "/test" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Settings", icon: Settings, path: "/settings" },
      { label: "Team", icon: Users, path: "/team" },
      { label: "Billing", icon: CreditCard, path: "/billing" },
    ],
  },
];

const adminSection = {
  label: "ADMIN",
  items: [
    { label: "Companies", icon: Building2, path: "/admin/companies" },
  ],
};

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSuperAdmin, isImpersonating, orgName, resetOrg } = useOrgContext();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const allSections = isSuperAdmin ? [adminSection, ...navSections] : navSections;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-sidebar-border">
        <img src={appendifyLogo} alt="Appendify Voz" className="h-8 w-8 object-contain" />
        <span className="text-lg font-bold text-foreground tracking-tight">Appendify Voz</span>
      </div>

      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg bg-primary/15 border border-primary/30 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Viewing</p>
            <p className="text-sm font-medium text-foreground truncate">{orgName}</p>
          </div>
          <button
            onClick={() => { resetOrg(); navigate("/admin/companies"); }}
            className="shrink-0 rounded-md p-1 hover:bg-primary/20 text-primary transition-colors"
            title="Exit impersonation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {allSections.map((section, idx) => (
          <div key={section.label} className={cn(idx > 0 && "mt-6")}>
            <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </h4>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = location.pathname === item.path ||
                  (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
