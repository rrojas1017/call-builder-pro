import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Plus, Loader2, FlaskConical, BookOpen, Pencil, Phone, PhoneIncoming, PhoneForwarded, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  mode: "outbound" | "inbound" | "hybrid";
}

const modeConfig = {
  outbound: { icon: Phone, label: "Outbound", className: "text-primary", bgClassName: "bg-primary/10" },
  inbound: { icon: PhoneIncoming, label: "Inbound", className: "text-secondary-foreground", bgClassName: "bg-secondary" },
  hybrid: { icon: PhoneForwarded, label: "Hybrid", className: "text-accent-foreground", bgClassName: "bg-accent" },
};

export default function AgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("agent_projects")
        .select("id, name, description, created_at, agent_specs(mode)")
        .order("created_at", { ascending: false });

      const mapped: Agent[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        created_at: p.created_at,
        mode: p.agent_specs?.mode || "outbound",
      }));
      setAgents(mapped);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      await supabase.from("inbound_numbers").update({ project_id: null }).eq("project_id", deletingId);
      await supabase.from("campaigns").update({ agent_project_id: null }).eq("agent_project_id", deletingId);
      const { error } = await supabase.from("agent_projects").delete().eq("id", deletingId);
      if (error) throw error;
      setAgents((prev) => prev.filter((a) => a.id !== deletingId));
      toast({ title: "Agent deleted", description: "The agent and all related data have been removed." });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <TooltipProvider>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agents</h1>
            <p className="text-muted-foreground mt-1">Manage your AI phone agents.</p>
          </div>
          <Link to="/create-agent">
            <Button><Plus className="mr-2 h-4 w-4" /> New Agent</Button>
          </Link>
        </div>

        {agents.length === 0 ? (
          <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No agents yet. Create your first one!</p>
            <Link to="/create-agent">
              <Button><Plus className="mr-2 h-4 w-4" /> Create Agent</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const config = modeConfig[agent.mode] || modeConfig.outbound;
              const ModeIcon = config.icon;
              return (
                <Link
                  key={agent.id}
                  to={`/campaigns?project=${agent.id}`}
                  className="surface-elevated rounded-xl p-5 space-y-3 hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${config.bgClassName}`}>
                          <ModeIcon className={`h-4 w-4 ${config.className}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{config.label} Agent</TooltipContent>
                    </Tooltip>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{config.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(agent.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                  )}
                  <div className="pt-1 flex items-center gap-3">
                    <Link
                      to={`/agents/${agent.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Link>
                    <Link
                      to={`/test?agent=${agent.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FlaskConical className="h-3 w-3" /> Test
                    </Link>
                    <Link
                      to={`/agents/${agent.id}/knowledge`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <BookOpen className="h-3 w-3" /> Knowledge
                    </Link>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingId(agent.id); }}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this agent and all its data including campaigns, calls, test results, and knowledge. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
