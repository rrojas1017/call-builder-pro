import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ChangeLogEntry {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
  source: string;
  source_category: string | null;
  conflict_detected: boolean;
  conflict_description: string | null;
  was_auto_applied: boolean;
  was_user_approved: boolean;
  created_at: string;
}

interface SpecChangeLogProps {
  projectId: string;
}

const sourceColors: Record<string, string> = {
  auto_train: "border-blue-500/30 text-blue-400",
  user_feedback: "border-green-500/30 text-green-400",
  manual_edit: "border-purple-500/30 text-purple-400",
  save_and_learn: "border-primary/30 text-primary",
  critical: "border-destructive/30 text-destructive",
  important: "border-yellow-500/30 text-yellow-400",
};

export default function SpecChangeLog({ projectId }: SpecChangeLogProps) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadEntries();
  }, [projectId]);

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("spec_change_log" as any)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    setEntries((data as any[]) || []);
    setLoading(false);
  };

  const filtered = entries.filter(e => {
    if (filter === "all") return true;
    if (filter === "conflicts") return e.conflict_detected;
    return e.source === filter;
  });

  const uniqueSources = [...new Set(entries.map(e => e.source))];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center p-6 text-sm text-muted-foreground">
        No changes logged yet. Changes will appear here as your agent is modified.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Change Log</h3>
          <Badge variant="outline" className="text-[10px]">{entries.length} changes</Badge>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="conflicts">Conflicts Only</SelectItem>
            {uniqueSources.map(s => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map((entry) => (
          <div key={entry.id} className={`rounded-lg border p-3 space-y-1.5 ${
            entry.conflict_detected ? "border-yellow-500/20 bg-yellow-500/5" : "border-border bg-muted/20"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={`text-[10px] ${sourceColors[entry.source] || "border-border text-muted-foreground"}`}>
                  {entry.source.replace(/_/g, " ")}
                </Badge>
                <span className="text-primary text-xs font-medium">{entry.field_changed}</span>
                {entry.conflict_detected && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(entry.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>

            {(entry.old_value || entry.new_value) && (
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="truncate text-muted-foreground">
                  <span className="text-destructive font-medium">Old:</span> {entry.old_value?.substring(0, 80) || "(empty)"}
                </div>
                <div className="truncate text-muted-foreground">
                  <span className="text-green-400 font-medium">New:</span> {entry.new_value?.substring(0, 80) || "(empty)"}
                </div>
              </div>
            )}

            {entry.conflict_detected && entry.conflict_description && (
              <p className="text-[11px] text-yellow-400">⚠️ {entry.conflict_description}</p>
            )}

            <div className="flex items-center gap-1">
              {entry.was_user_approved ? (
                <span className="text-[10px] text-green-400 flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" /> User approved</span>
              ) : entry.was_auto_applied ? (
                <span className="text-[10px] text-blue-400 flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" /> Auto-applied</span>
              ) : (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><XCircle className="h-2.5 w-2.5" /> Rejected</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
