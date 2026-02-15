import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Bot, PlusCircle, Megaphone, Phone, PhoneIncoming,
  BookOpen, Settings, LogOut, GraduationCap, FileSpreadsheet, Users, CreditCard,
  Building2, ScrollText, X, Pencil, Save, RotateCcw, GripVertical,
  LucideIcon
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useSidebarConfig, SidebarSection } from "@/hooks/useSidebarConfig";
import appendifyLogo from "@/assets/appendify-logo.png";
import { useState, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

// Icon map: path → icon component
const iconMap: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/agents": Bot,
  "/create-agent": PlusCircle,
  "/knowledge": BookOpen,
  "/campaigns": Megaphone,
  "/lists": FileSpreadsheet,
  "/inbound": PhoneIncoming,
  "/calls": Phone,
  "/test": GraduationCap,
  "/settings": Settings,
  "/team": Users,
  "/billing": CreditCard,
  "/admin/companies": Building2,
  "/admin/audit": ScrollText,
};

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSuperAdmin, isImpersonating, orgName, resetOrg } = useOrgContext();
  const { sections, adminSection, saveConfig } = useSidebarConfig();

  const [editMode, setEditMode] = useState(false);
  const [editSections, setEditSections] = useState<SidebarSection[]>([]);

  // Drag state
  const dragItem = useRef<{ sectionIdx: number; itemIdx?: number } | null>(null);
  const dragOverItem = useRef<{ sectionIdx: number; itemIdx?: number } | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const enterEditMode = () => {
    setEditSections(JSON.parse(JSON.stringify(sections)));
    setEditMode(true);
  };

  const cancelEditMode = () => {
    setEditMode(false);
    setEditSections([]);
  };

  const handleSave = async () => {
    await saveConfig(editSections);
    setEditMode(false);
    toast({ title: "Navigation order saved", description: "All users will see this layout." });
  };

  // --- Section drag handlers ---
  const onSectionDragStart = (idx: number) => {
    dragItem.current = { sectionIdx: idx };
  };
  const onSectionDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverItem.current = { sectionIdx: idx };
  };
  const onSectionDrop = useCallback(() => {
    if (!dragItem.current || !dragOverItem.current) return;
    const from = dragItem.current.sectionIdx;
    const to = dragOverItem.current.sectionIdx;
    if (from === to || dragItem.current.itemIdx !== undefined) return;
    setEditSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }, []);

  // --- Item drag handlers ---
  const onItemDragStart = (sectionIdx: number, itemIdx: number) => {
    dragItem.current = { sectionIdx, itemIdx };
  };
  const onItemDragOver = (e: React.DragEvent, sectionIdx: number, itemIdx: number) => {
    e.preventDefault();
    dragOverItem.current = { sectionIdx, itemIdx };
  };
  const onItemDrop = useCallback(() => {
    if (!dragItem.current || !dragOverItem.current || dragItem.current.itemIdx === undefined) return;
    const fromSection = dragItem.current.sectionIdx;
    const fromItem = dragItem.current.itemIdx;
    const toSection = dragOverItem.current.sectionIdx;
    const toItem = dragOverItem.current.itemIdx ?? 0;

    setEditSections((prev) => {
      const copy = prev.map((s) => ({ ...s, items: [...s.items] }));
      const [movedItem] = copy[fromSection].items.splice(fromItem, 1);
      copy[toSection].items.splice(toItem, 0, movedItem);
      return copy;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }, []);

  const displaySections = editMode ? editSections : sections;
  const allSections = isSuperAdmin
    ? [adminSection, ...displaySections]
    : displaySections;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-sidebar-border">
        <img src={appendifyLogo} alt="Appendify Voz" className="h-8 w-8 object-contain" />
        <span className="text-lg font-bold text-foreground tracking-tight flex-1">Appendify Voz</span>
        {isSuperAdmin && !editMode && (
          <button
            onClick={enterEditMode}
            className="rounded-md p-1 hover:bg-sidebar-accent/50 text-muted-foreground transition-colors"
            title="Customize navigation order"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Edit mode toolbar */}
      {editMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-sidebar-border bg-primary/5">
          <span className="text-xs font-medium text-primary flex-1">Editing nav order</span>
          <button
            onClick={cancelEditMode}
            className="rounded-md p-1.5 hover:bg-sidebar-accent/50 text-muted-foreground transition-colors"
            title="Cancel"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSave}
            className="rounded-md p-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Save order"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
        {allSections.map((section, sectionIdx) => {
          const isAdmin = section.label === "ADMIN";
          // In edit mode, ADMIN section is not draggable (always first for super admins)
          const sectionDraggable = editMode && !isAdmin;
          // Adjust index for edit sections (admin is prepended, not part of editSections)
          const editIdx = isSuperAdmin ? sectionIdx - 1 : sectionIdx;

          return (
            <div
              key={section.label}
              className={cn(sectionIdx > 0 && "mt-6", sectionDraggable && "cursor-grab")}
              draggable={sectionDraggable}
              onDragStart={sectionDraggable ? () => onSectionDragStart(editIdx) : undefined}
              onDragOver={sectionDraggable ? (e) => onSectionDragOver(e, editIdx) : undefined}
              onDrop={sectionDraggable ? onSectionDrop : undefined}
            >
              <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                {sectionDraggable && <GripVertical className="h-3 w-3 text-muted-foreground/50" />}
                {section.label}
              </h4>
              <div className="space-y-1">
                {section.items.map((item, itemIdx) => {
                  const IconComp = iconMap[item.path];
                  if (!IconComp) return null;
                  const active = location.pathname === item.path ||
                    (item.path !== "/dashboard" && location.pathname.startsWith(item.path));
                  const itemDraggable = editMode && !isAdmin;

                  return (
                    <div
                      key={item.path}
                      draggable={itemDraggable}
                      onDragStart={itemDraggable ? (e) => { e.stopPropagation(); onItemDragStart(editIdx, itemIdx); } : undefined}
                      onDragOver={itemDraggable ? (e) => { e.stopPropagation(); onItemDragOver(e, editIdx, itemIdx); } : undefined}
                      onDrop={itemDraggable ? (e) => { e.stopPropagation(); onItemDrop(); } : undefined}
                    >
                      <Link
                        to={editMode ? "#" : item.path}
                        onClick={editMode ? (e) => e.preventDefault() : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          active && !editMode
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                          itemDraggable && "cursor-grab"
                        )}
                      >
                        {itemDraggable && <GripVertical className="h-3 w-3 text-muted-foreground/50 -ml-1" />}
                        <IconComp className={cn("h-4 w-4", active && !editMode && "text-primary")} />
                        {item.label}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <ThemeToggle />
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
