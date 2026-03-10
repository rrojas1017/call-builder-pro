import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Plus, Loader2, FlaskConical, BookOpen, Pencil, Phone, PhoneIncoming, PhoneForwarded, Trash2, GraduationCap, RefreshCw, LayoutGrid, List, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  mode: "outbound" | "inbound" | "hybrid";
  maturity_level: string;
  has_retell_id: boolean;
}

const maturityConfig: Record<string, { label: string; className: string; bgClassName: string; icon?: boolean }> = {
  training: { label: "Training", className: "text-muted-foreground", bgClassName: "bg-muted" },
  developing: { label: "Developing", className: "text-blue-400", bgClassName: "bg-blue-500/10 border-blue-500/20" },
  competent: { label: "Competent", className: "text-amber-400", bgClassName: "bg-amber-500/10 border-amber-500/20" },
  expert: { label: "Expert", className: "text-emerald-400", bgClassName: "bg-emerald-500/10 border-emerald-500/20" },
  graduated: { label: "Graduated", className: "text-purple-400", bgClassName: "bg-purple-500/10 border-purple-500/20", icon: true },
};

const modeConfig = {
  outbound: { icon: Phone, label: "Outbound", className: "text-primary", bgClassName: "bg-primary/10" },
  inbound: { icon: PhoneIncoming, label: "Inbound", className: "text-secondary-foreground", bgClassName: "bg-secondary" },
  hybrid: { icon: PhoneForwarded, label: "Hybrid", className: "text-accent-foreground", bgClassName: "bg-accent" },
};

function AgentBadges({ agent }: { agent: Agent }) {
  const config = modeConfig[agent.mode] || modeConfig.outbound;
  const maturity = maturityConfig[agent.maturity_level] || maturityConfig.training;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{config.label}</Badge>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Append</Badge>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 border ${maturity.bgClassName} ${maturity.className}`}>
        {maturity.icon && <GraduationCap className="h-2.5 w-2.5 mr-0.5" />}
        {maturity.label}
      </Badge>
    </div>
  );
}

function AgentActions({ agent, onDelete, onClone, cloningId }: { agent: Agent; onDelete: (id: string) => void; onClone: (agent: Agent) => void; cloningId: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <Link to={`/agents/${agent.id}/edit`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Pencil className="h-3 w-3" /> Edit
      </Link>
      <Link to={`/test?agent=${agent.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <FlaskConical className="h-3 w-3" /> Test
      </Link>
      <Link to={`/agents/${agent.id}/knowledge`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <BookOpen className="h-3 w-3" /> Knowledge
      </Link>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClone(agent); }} disabled={cloningId === agent.id} className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
        {cloningId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} Clone
      </button>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(agent.id); }} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
        <Trash2 className="h-3 w-3" /> Delete
      </button>
    </div>
  );
}

export default function AgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const { toast } = useToast();

  const loadAgents = async () => {
    const { data } = await supabase
      .from("agent_projects")
      .select("id, name, description, created_at, maturity_level, agent_specs(mode, retell_agent_id)")
      .order("created_at", { ascending: false });

    const mapped: Agent[] = (data || []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description, created_at: p.created_at,
      mode: p.agent_specs?.mode || "outbound", maturity_level: p.maturity_level || "training",
      has_retell_id: !!p.agent_specs?.retell_agent_id,
    }));
    setAgents(mapped);
    setLoading(false);
  };

  useEffect(() => { if (user) loadAgents(); }, [user]);

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
    } finally { setDeleteLoading(false); setDeletingId(null); }
  };

  const unprovisionedCount = agents.filter(a => !a.has_retell_id).length;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-sync-retell-agents");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sync complete", description: `${data.synced} of ${data.total} agents synced successfully.` });
      await loadAgents();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally { setSyncing(false); }
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
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => { if (v) setViewMode(v as "card" | "list"); }}>
              <ToggleGroupItem value="card" aria-label="Card view"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view"><List className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
            <Link to="/create-agent"><Button><Plus className="mr-2 h-4 w-4" /> New Agent</Button></Link>
          </div>
        </div>

        {unprovisionedCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{unprovisionedCount}</span> agent{unprovisionedCount !== 1 ? "s" : ""} need Retell provisioning
            </p>
            <Button size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sync All Now
            </Button>
          </div>
        )}

        {agents.length === 0 ? (
          <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No agents yet. Create your first one!</p>
            <Link to="/create-agent"><Button><Plus className="mr-2 h-4 w-4" /> Create Agent</Button></Link>
          </div>
        ) : viewMode === "card" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const config = modeConfig[agent.mode] || modeConfig.outbound;
              const ModeIcon = config.icon;
              return (
                <Link key={agent.id} to={`/campaigns?project=${agent.id}`} className="surface-elevated rounded-xl p-5 space-y-3 hover:border-primary/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${config.bgClassName}`}>
                          <ModeIcon className={`h-4 w-4 ${config.className}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{config.label} Agent</TooltipContent>
                    </Tooltip>
                    <h3 className="font-semibold text-foreground break-words">{agent.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <AgentBadges agent={agent} />
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(agent.created_at).toLocaleDateString()}</span>
                  </div>
                  {agent.description && <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>}
                  <div className="pt-1"><AgentActions agent={agent} onDelete={setDeletingId} /></div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="surface-elevated rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => {
                  const config = modeConfig[agent.mode] || modeConfig.outbound;
                  const ModeIcon = config.icon;
                  return (
                    <TableRow key={agent.id} className="cursor-pointer" onClick={() => window.location.href = `/campaigns?project=${agent.id}`}>
                      <TableCell>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgClassName}`}>
                          <ModeIcon className={`h-4 w-4 ${config.className}`} />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{agent.name}</TableCell>
                      <TableCell><AgentBadges agent={agent} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(agent.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right"><AgentActions agent={agent} onDelete={setDeletingId} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
              <AlertDialogAction onClick={handleDelete} disabled={deleteLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
