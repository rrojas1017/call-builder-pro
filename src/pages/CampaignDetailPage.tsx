import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Play, Pause, RefreshCw, Trash2, PhoneOff, Save } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(280 67% 55%)",
  "hsl(var(--muted))",
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "outline" },
  calling: { label: "In Progress", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  voicemail: { label: "Voicemail", variant: "secondary" },
  no_answer: { label: "No Answer", variant: "secondary" },
  busy: { label: "Busy", variant: "secondary" },
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [agent, setAgent] = useState<any>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [stoppingCalls, setStoppingCalls] = useState<Set<string>>(new Set());
  const [editConcurrency, setEditConcurrency] = useState<number | null>(null);
  const [savingConcurrency, setSavingConcurrency] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    const [campRes, contactsRes, clRes, callsRes] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", id).single(),
      supabase.from("contacts").select("*").eq("campaign_id", id).order("called_at", { ascending: false, nullsFirst: false }),
      supabase.from("campaign_lists" as any).select("*, dial_lists(*)").eq("campaign_id", id),
      supabase.from("calls").select("id, contact_id, duration_seconds, outcome, evaluation, started_at").eq("campaign_id", id),
    ]);

    setCampaign(campRes.data);
    setContacts(contactsRes.data || []);
    setLists((clRes.data as any[])?.map((cl: any) => cl.dial_lists) || []);
    setCalls(callsRes.data || []);

    if (campRes.data?.agent_project_id) {
      const { data: ag } = await supabase
        .from("agent_projects")
        .select("name")
        .eq("id", campRes.data.agent_project_id)
        .single();
      setAgent(ag);
    }
    setLoading(false);
  }, [user, id]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for contacts
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`campaign-contacts-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter: `campaign_id=eq.${id}` },
        (payload) => {
          setContacts((prev) =>
            prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Periodic refresh for calls data (every 15s when running)
  useEffect(() => {
    if (!id || campaign?.status !== "running") return;
    const interval = setInterval(async () => {
      const [callsRes, campRes] = await Promise.all([
        supabase.from("calls").select("id, contact_id, duration_seconds, outcome, evaluation, started_at").eq("campaign_id", id),
        supabase.from("campaigns").select("status").eq("id", id).single(),
      ]);
      setCalls(callsRes.data || []);
      if (campRes.data && campRes.data.status !== campaign?.status) {
        setCampaign((prev: any) => ({ ...prev, status: campRes.data!.status }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id, campaign?.status]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("start-campaign", {
        body: { campaign_id: id },
      });
      if (error) throw error;
      setCampaign((prev: any) => ({ ...prev, status: "running" }));
      toast({ title: "Campaign started!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      await supabase.from("campaigns").update({ status: "paused" }).eq("id", id);
      setCampaign((prev: any) => ({ ...prev, status: "paused" }));
      toast({ title: "Campaign paused" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Campaign deleted" });
      navigate("/campaigns");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setActionLoading(false);
    }
  };

  const liveCalls = contacts.filter((c) => c.status === "calling" && c.bland_call_id);

  const handleStopCall = async (callId: string, contactId: string) => {
    setStoppingCalls((prev) => new Set(prev).add(contactId));
    try {
      const { error } = await supabase.functions.invoke("stop-call", {
        body: { call_id: callId, contact_id: contactId },
      });
      if (error) throw error;
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, status: "cancelled" } : c))
      );
      toast({ title: "Call stopped" });
    } catch (err: any) {
      toast({ title: "Error stopping call", description: err.message, variant: "destructive" });
    } finally {
      setStoppingCalls((prev) => {
        const next = new Set(prev);
        next.delete(contactId);
        return next;
      });
    }
  };

  const handleStopAll = async () => {
    for (const c of liveCalls) {
      handleStopCall(c.bland_call_id, c.id);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!campaign) {
    return <div className="p-8 text-muted-foreground">Campaign not found.</div>;
  }

  // Compute stats
  const total = contacts.length;
  const inProgress = contacts.filter((c) => c.status === "calling").length;
  const completed = contacts.filter((c) => c.status === "completed").length;
  const failed = contacts.filter((c) => c.status === "failed").length;
  const processed = completed + failed;
  const successRate = processed > 0 ? Math.round((completed / processed) * 100) : 0;
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Call-level stats
  const callsWithDuration = calls.filter((c) => c.duration_seconds != null);
  const avgDuration = callsWithDuration.length > 0
    ? Math.round(callsWithDuration.reduce((sum, c) => sum + c.duration_seconds, 0) / callsWithDuration.length)
    : 0;
  const callsWithScore = calls.filter((c) => c.evaluation?.overall_score != null);
  const avgScore = callsWithScore.length > 0
    ? Math.round(callsWithScore.reduce((sum, c) => sum + Number(c.evaluation.overall_score), 0) / callsWithScore.length)
    : 0;

  // Build call lookup by contact_id
  const callByContact: Record<string, any> = {};
  calls.forEach((c) => { if (c.contact_id) callByContact[c.contact_id] = c; });

  // Outcome distribution
  const outcomeCounts: Record<string, number> = {};
  contacts.forEach((c) => {
    const key = c.status || "queued";
    outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
  });
  const pieData = Object.entries(outcomeCounts).map(([name, value]) => ({ name, value }));

  // Per-list breakdown
  const listStats = lists.map((l: any) => {
    const listContacts = contacts.filter((c) => c.list_id === l.id);
    const listCompleted = listContacts.filter((c) => c.status === "completed").length;
    const listFailed = listContacts.filter((c) => c.status === "failed").length;
    const listProcessed = listCompleted + listFailed;
    const listCalls = listContacts.map((c) => callByContact[c.id]).filter(Boolean);
    const listDurations = listCalls.filter((c: any) => c.duration_seconds != null);
    const listAvgDur = listDurations.length > 0
      ? Math.round(listDurations.reduce((s: number, c: any) => s + c.duration_seconds, 0) / listDurations.length)
      : 0;
    return {
      name: l.name,
      total: listContacts.length,
      completed: listCompleted,
      rate: listProcessed > 0 ? Math.round((listCompleted / listProcessed) * 100) : 0,
      avgDuration: listAvgDur,
    };
  });

  const statusColor: Record<string, string> = {
    draft: "text-muted-foreground bg-muted",
    running: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30",
    paused: "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30",
    completed: "text-primary bg-primary/10",
  };

  const kpis = [
    { label: "Total Contacts", value: total },
    { label: "In Progress", value: inProgress },
    { label: "Completed", value: completed },
    { label: "Failed", value: failed },
    { label: "Success Rate", value: `${successRate}%` },
    { label: "Avg Duration", value: avgDuration > 0 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : "—" },
    { label: "Avg Score", value: avgScore > 0 ? `${avgScore}/100` : "—" },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/campaigns" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[campaign.status] || ""}`}>
                {campaign.status}
              </span>
              {agent && <span>Agent: {agent.name}</span>}
              <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
              <span className="flex items-center gap-1.5">
                Concurrency:
                {editConcurrency !== null ? (
                  <>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={editConcurrency}
                      onChange={(e) => setEditConcurrency(Math.max(1, Math.min(100, Number(e.target.value))))}
                      className="w-16 h-6 text-xs inline-block"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5"
                      disabled={savingConcurrency}
                      onClick={async () => {
                        setSavingConcurrency(true);
                        await supabase.from("campaigns").update({ max_concurrent_calls: editConcurrency }).eq("id", id);
                        setCampaign((prev: any) => ({ ...prev, max_concurrent_calls: editConcurrency }));
                        setEditConcurrency(null);
                        setSavingConcurrency(false);
                        toast({ title: "Concurrency updated" });
                      }}
                    >
                      {savingConcurrency ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                  </>
                ) : (
                  <button
                    className="underline decoration-dotted cursor-pointer hover:text-foreground"
                    onClick={() => setEditConcurrency(campaign.max_concurrent_calls || 1)}
                  >
                    {campaign.max_concurrent_calls || 1}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          {(campaign.status === "draft" || campaign.status === "paused") && (
            <Button size="sm" onClick={handleStart} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {campaign.status === "paused" ? "Resume" : "Start"}
            </Button>
          )}
          {campaign.status === "running" && (
            <Button size="sm" variant="outline" onClick={handlePause} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              Pause
            </Button>
          )}
          {campaign.status !== "running" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={actionLoading}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this campaign and all its contact data. Call records will be preserved. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{processed} of {total} contacts processed</span>
          <span>{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-foreground">{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Calls */}
      {liveCalls.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-50/5">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              Live Calls ({liveCalls.length})
            </CardTitle>
            <Button size="sm" variant="destructive" onClick={handleStopAll}>
              <PhoneOff className="h-4 w-4 mr-1" /> Stop All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {liveCalls.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={stoppingCalls.has(c.id)}
                    onClick={() => handleStopCall(c.bland_call_id, c.id)}
                  >
                    {stoppingCalls.has(c.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <><PhoneOff className="h-3 w-3 mr-1" /> Stop</>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcome pie */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Outcome Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Per-list breakdown */}
        {listStats.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Performance by List</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>List</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Avg Dur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listStats.map((ls) => (
                    <TableRow key={ls.name}>
                      <TableCell className="font-medium">{ls.name}</TableCell>
                      <TableCell className="text-right">{ls.total}</TableCell>
                      <TableCell className="text-right">{ls.completed}</TableCell>
                      <TableCell className="text-right">{ls.rate}%</TableCell>
                      <TableCell className="text-right text-xs">
                        {ls.avgDuration > 0 ? `${Math.floor(ls.avgDuration / 60)}m ${ls.avgDuration % 60}s` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contact table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacts ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Called At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => {
                  const call = callByContact[c.id];
                  const badge = STATUS_BADGES[c.status] || { label: c.status, variant: "outline" as const };
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {call?.duration_seconds != null
                          ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{call?.outcome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.called_at ? new Date(c.called_at).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No contacts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
