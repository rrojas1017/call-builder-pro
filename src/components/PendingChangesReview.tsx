import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PendingChange {
  id: string;
  project_id: string;
  org_id: string;
  field_to_change: string;
  current_value: string | null;
  proposed_value: string | null;
  change_type: string | null;
  source: string;
  source_category: string | null;
  source_detail: string | null;
  conflict_type: string | null;
  conflict_description: string;
  affected_fields: any;
  impact_summary: string | null;
  status: string;
  created_at: string;
}

interface PendingChangesReviewProps {
  projectId: string;
  onChangeApplied?: () => void;
}

export default function PendingChangesReview({ projectId, onChangeApplied }: PendingChangesReviewProps) {
  const { toast } = useToast();
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    loadChanges();
  }, [projectId]);

  const loadChanges = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pending_spec_changes" as any)
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setChanges((data as any[]) || []);
    setLoading(false);
  };

  const handleApprove = async (change: PendingChange) => {
    setActionId(change.id);
    try {
      // Apply the change directly
      const updatePayload: Record<string, any> = {};
      try {
        updatePayload[change.field_to_change] = JSON.parse(change.proposed_value || "");
      } catch {
        updatePayload[change.field_to_change] = change.proposed_value;
      }

      const { error: updateErr } = await supabase
        .from("agent_specs")
        .update(updatePayload as any)
        .eq("project_id", change.project_id);
      if (updateErr) throw updateErr;

      // Mark as approved
      await supabase
        .from("pending_spec_changes" as any)
        .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
        .eq("id", change.id);

      // Log to change log
      await supabase.from("spec_change_log" as any).insert({
        project_id: change.project_id,
        org_id: change.org_id,
        field_changed: change.field_to_change,
        old_value: change.current_value?.substring(0, 1000),
        new_value: change.proposed_value?.substring(0, 1000),
        change_type: change.change_type || "patch",
        source: change.source,
        source_category: change.source_category,
        source_detail: change.source_detail,
        conflict_detected: true,
        conflict_description: change.conflict_description,
        was_auto_applied: false,
        was_user_approved: true,
      } as any);

      toast({ title: "Change approved", description: `${change.field_to_change} updated successfully.` });
      setChanges(prev => prev.filter(c => c.id !== change.id));
      onChangeApplied?.();
    } catch (err: any) {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (change: PendingChange) => {
    setActionId(change.id);
    try {
      await supabase
        .from("pending_spec_changes" as any)
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          review_notes: rejectNotes[change.id] || null,
        } as any)
        .eq("id", change.id);

      await supabase.from("spec_change_log" as any).insert({
        project_id: change.project_id,
        org_id: change.org_id,
        field_changed: change.field_to_change,
        old_value: change.current_value?.substring(0, 1000),
        new_value: change.proposed_value?.substring(0, 1000),
        change_type: change.change_type || "patch",
        source: change.source,
        conflict_detected: true,
        conflict_description: change.conflict_description,
        was_auto_applied: false,
        was_user_approved: false,
      } as any);

      toast({ title: "Change rejected" });
      setChanges(prev => prev.filter(c => c.id !== change.id));
    } catch (err: any) {
      toast({ title: "Failed to reject", description: err.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  if (loading) return null;
  if (changes.length === 0) return null;

  const conflictTypeColors: Record<string, string> = {
    contradiction: "border-destructive/30 text-destructive",
    overwrite: "border-yellow-500/30 text-yellow-400",
    ambiguity: "border-blue-500/30 text-blue-400",
    scope_expansion: "border-purple-500/30 text-purple-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <h3 className="font-semibold text-foreground text-sm">Pending Changes</h3>
        <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400">
          {changes.length} awaiting review
        </Badge>
      </div>

      {changes.map((change) => (
        <div key={change.id} className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={`text-[10px] ${conflictTypeColors[change.conflict_type || ""] || "border-border text-muted-foreground"}`}>
              {change.conflict_type || "conflict"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{change.source}</span>
          </div>

          <p className="text-sm font-medium text-foreground">
            Proposed change to: <span className="text-primary">{change.field_to_change}</span>
          </p>

          <p className="text-xs text-yellow-400">{change.conflict_description}</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
              <p className="text-[10px] text-destructive font-semibold mb-1">CURRENT</p>
              <p className="text-xs text-foreground whitespace-pre-wrap">{change.current_value?.substring(0, 200) || "(empty)"}</p>
            </div>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
              <p className="text-[10px] text-green-400 font-semibold mb-1">PROPOSED</p>
              <p className="text-xs text-foreground whitespace-pre-wrap">{change.proposed_value?.substring(0, 200) || "(empty)"}</p>
            </div>
          </div>

          {change.impact_summary && (
            <p className="text-xs text-muted-foreground">
              <strong>Impact:</strong> {change.impact_summary}
            </p>
          )}

          <Textarea
            placeholder="Optional notes for rejection..."
            className="text-xs min-h-0 resize-none"
            rows={1}
            value={rejectNotes[change.id] || ""}
            onChange={(e) => setRejectNotes(prev => ({ ...prev, [change.id]: e.target.value }))}
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleApprove(change)} disabled={actionId === change.id}>
              {actionId === change.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleReject(change)} disabled={actionId === change.id}>
              <XCircle className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
