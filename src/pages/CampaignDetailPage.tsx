import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Play, Pause, RefreshCw, Trash2, PhoneOff, Save, FileText, Phone, ExternalLink, AlertTriangle, Lightbulb, BookOpen, ShieldCheck } from "lucide-react";
import LiveCallMonitor from "@/components/LiveCallMonitor";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

// Lifecycle status mapping
const getLifecycleStatus = (status: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; isLive?: boolean } => {
  switch (status) {
    case "queued":
      return { label: "Queued", variant: "outline" };
    case "calling":
      return { label: "Dialing", variant: "secondary", isLive: true };
    case "completed":
    case "qualified":
    case "disqualified":
      return { label: "Connected", variant: "default" };
    case "left_message":
    case "voicemail":
    case "no_answer":
    case "busy":
    case "call_me_later":
    case "not_available":
    case "failed":
    case "disconnected":
    case "dnc":
    case "cancelled":
      return { label: "Attempted", variant: "secondary" };
    default:
      return { label: status, variant: "outline" };
  }
};

// Outcome badge styling
const getOutcomeBadge = (outcome: string | null | undefined): { label: string; className: string } | null => {
  if (!outcome) return null;
  switch (outcome) {
    case "qualified":
      return { label: "Qualified", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800" };
    case "disqualified":
      return { label: "Disqualified", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800" };
    case "completed":
      return { label: "Completed", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800" };
    case "callback":
    case "call_me_later":
      return { label: "Callback", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800" };
    case "voicemail":
      return { label: "Voicemail", className: "bg-muted text-muted-foreground border-border" };
    case "no_answer":
      return { label: "No Answer", className: "bg-muted text-muted-foreground border-border" };
    case "busy":
      return { label: "Busy", className: "bg-muted text-muted-foreground border-border" };
    case "not_available":
      return { label: "Not Available", className: "bg-muted text-muted-foreground border-border" };
    case "dnc":
      return { label: "DNC", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800" };
    case "disconnected":
      return { label: "Disconnected", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800" };
    case "failed":
      return { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
    case "left_message":
      return { label: "Left Message", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800" };
    default:
      return { label: outcome, className: "bg-muted text-muted-foreground border-border" };
  }
};

// Resolve the outcome to display for a contact
const resolveOutcome = (contact: any, call: any): string | null => {
  if (contact.status === "queued" || contact.status === "calling") return null;
  if (call?.outcome) return call.outcome;
  // Fall back to raw contact status for non-connected calls
  const fallbackOutcomes = ["voicemail", "no_answer", "busy", "dnc", "disconnected", "failed", "cancelled", "call_me_later", "not_available", "left_message"];
  if (fallbackOutcomes.includes(contact.status)) return contact.status;
  return contact.status === "completed" ? "completed" : null;
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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const recentlyCancelledRef = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    const [campRes, contactsRes, clRes, callsRes] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", id).single(),
      supabase.from("contacts").select("*").eq("campaign_id", id).order("called_at", { ascending: false, nullsFirst: false }),
      supabase.from("campaign_lists" as any).select("*, dial_lists(*)").eq("campaign_id", id),
      supabase.from("calls").select("*").eq("campaign_id", id),
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

  // Periodic refresh for calls + contacts data (every 5s)
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      const [callsRes, contactsRes, campRes] = await Promise.all([
        supabase.from("calls").select("*").eq("campaign_id", id),
        supabase.from("contacts").select("*").eq("campaign_id", id).order("called_at", { ascending: false, nullsFirst: false }),
        supabase.from("campaigns").select("status").eq("id", id).single(),
      ]);
      setCalls(callsRes.data || []);
      // Merge recently-cancelled overrides to prevent flicker
      const now = Date.now();
      const merged = (contactsRes.data || []).map((c: any) => {
        const cancelledAt = recentlyCancelledRef.current.get(c.id);
        if (cancelledAt && now - cancelledAt < 10000) {
          return { ...c, status: "cancelled" };
        }
        return c;
      });
      // Clean up expired entries
      recentlyCancelledRef.current.forEach((ts, key) => {
        if (now - ts > 10000) recentlyCancelledRef.current.delete(key);
      });
      setContacts(merged);
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

  const liveCalls = contacts.filter((c) => c.status === "calling");

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

  const handleForceCancel = async (contactId: string) => {
    setStoppingCalls((prev) => new Set(prev).add(contactId));
    try {
      const { data, error } = await supabase
        .from("contacts")
        .update({ status: "cancelled" })
        .eq("id", contactId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "Could not cancel", description: "Permission denied — no rows updated", variant: "destructive" });
        return;
      }
      recentlyCancelledRef.current.set(contactId, Date.now());
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, status: "cancelled" } : c))
      );
      toast({ title: "Call force-cancelled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
      if (c.bland_call_id) {
        handleStopCall(c.bland_call_id, c.id);
      } else {
        handleForceCancel(c.id);
      }
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
  const terminalStatuses = ["completed", "dnc", "disconnected", "failed", "cancelled"];
  const retryableStatuses = ["voicemail", "no_answer", "busy", "call_me_later", "not_available"];
  const completed = contacts.filter((c) => c.status === "completed").length;
  const dnc = contacts.filter((c) => c.status === "dnc").length;
  const disconnected = contacts.filter((c) => c.status === "disconnected").length;
  const failed = contacts.filter((c) => c.status === "failed").length;
  const retryable = contacts.filter((c) => retryableStatuses.includes(c.status)).length;
  const terminal = contacts.filter((c) => terminalStatuses.includes(c.status)).length;
  const processed = terminal + retryable;
  const qualified = calls.filter((c) => c.outcome === "qualified").length;
  const called = contacts.filter((c) => c.status !== "queued").length;
  const conversionRate = called > 0 ? Math.round((qualified / called) * 100) : 0;
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
    { label: "Qualified", value: qualified },
    { label: "Terminal", value: terminal },
    { label: "Retryable", value: retryable },
    { label: "Failed", value: failed },
    { label: "Conversion Rate", value: `${conversionRate}%` },
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
              {campaign.hipaa_enabled && (
                <Badge variant="outline" className="gap-1 text-xs border-primary/50 text-primary">
                  <ShieldCheck className="h-3 w-3" /> HIPAA
                </Badge>
              )}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
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
                  {c.bland_call_id ? (
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
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={stoppingCalls.has(c.id)}
                      onClick={() => handleForceCancel(c.id)}
                    >
                      {stoppingCalls.has(c.id) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><PhoneOff className="h-3 w-3 mr-1" /> Force Cancel</>
                      )}
                    </Button>
                  )}
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
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                   <TableHead>Attempts</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  {campaign.hipaa_enabled && <TableHead>Compliance</TableHead>}
                  <TableHead>Called At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => {
                  const call = callByContact[c.id];
                  const lifecycle = getLifecycleStatus(c.status);
                  const outcomeValue = resolveOutcome(c, call);
                  const outcomeBadge = getOutcomeBadge(outcomeValue);
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedContactId(c.id)}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {lifecycle.isLive && (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                            </span>
                          )}
                          <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-center">{c.attempts || 0}</TableCell>
                      <TableCell className="text-xs">
                        {call?.duration_seconds != null
                          ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {outcomeBadge ? (
                          <Badge variant="outline" className={`text-xs ${outcomeBadge.className}`}>
                            {outcomeBadge.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {campaign.hipaa_enabled && (
                        <TableCell>
                          {(() => {
                            const score = call?.evaluation?.compliance_score;
                            if (score == null) return (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span className="text-xs">—</span>
                              </div>
                            );
                            const color = score >= 80 ? "text-green-600 dark:text-green-400" : score >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
                            const label = score >= 80 ? "Pass" : score >= 50 ? "Partial" : "Fail";
                            return (
                              <div className="flex items-center gap-1">
                                <ShieldCheck className={`h-3.5 w-3.5 ${color}`} />
                                <span className={`text-xs font-medium ${color}`}>{label}</span>
                              </div>
                            );
                          })()}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground">
                        {c.called_at ? new Date(c.called_at).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={campaign.hipaa_enabled ? 8 : 7} className="text-center text-muted-foreground py-8">
                      No contacts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Contact Detail Drawer */}
      <Sheet open={!!selectedContactId} onOpenChange={(open) => !open && setSelectedContactId(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedContactId && (() => {
            const contact = contacts.find((c) => c.id === selectedContactId);
            const call = callByContact[selectedContactId];
            if (!contact) return <p className="text-muted-foreground">Contact not found.</p>;
            const evaluation = call?.evaluation as any;
            const badge = getLifecycleStatus(contact.status);

            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {contact.name}
                  </SheetTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span className="font-mono">{contact.phone}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </SheetHeader>

                {campaign.hipaa_enabled && (
                  (() => {
                    const score = call?.evaluation?.compliance_score;
                    const color = score == null ? "border-muted-foreground/30 bg-muted/30" : score >= 80 ? "border-green-500/30 bg-green-500/10" : score >= 50 ? "border-yellow-500/30 bg-yellow-500/10" : "border-red-500/30 bg-red-500/10";
                    const textColor = score == null ? "text-muted-foreground" : score >= 80 ? "text-green-600 dark:text-green-400" : score >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
                    const label = score == null ? "Pending Review" : score >= 80 ? "HIPAA Compliant" : score >= 50 ? "Partially Compliant" : "Non-Compliant";
                    return (
                      <div className={`flex items-center gap-2 rounded-md border p-3 ${color}`}>
                        <ShieldCheck className={`h-5 w-5 ${textColor}`} />
                        <div>
                          <p className={`text-sm font-semibold ${textColor}`}>{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {score != null ? `Compliance Score: ${score}/100` : "No evaluation yet"}
                          </p>
                        </div>
                      </div>
                    );
                  })()
                )}

                {contact.status === "calling" && (
                  <LiveCallMonitor
                    blandCallId={contact.bland_call_id}
                    retellCallId={call?.retell_call_id}
                    contactId={contact.id}
                    isActive={true}
                  />
                )}

                <div className="space-y-5 mt-4">
                  {/* Call metadata */}
                  {call && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-medium">
                          {call.duration_seconds != null
                            ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Outcome</p>
                        <p className="font-medium">{call.outcome || "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* Recording */}
                  {call?.recording_url && (
                    <a
                      href={call.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Listen to Recording
                    </a>
                  )}

                  {/* Evaluation scores */}
                  {evaluation && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Evaluation Scores</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { label: "Overall", value: evaluation.overall_score },
                          { label: "Compliance", value: evaluation.compliance_score },
                          { label: "Objective", value: evaluation.objective_score },
                          { label: "Humanness", value: evaluation.humanness_score },
                          { label: "Naturalness", value: evaluation.naturalness_score },
                        ].map((s) => (
                          <div key={s.label} className="rounded-md border p-2 text-center">
                            <p className="text-lg font-bold text-foreground">{s.value ?? "—"}</p>
                            <p className="text-[11px] text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {evaluation?.issues && (evaluation.issues as any[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-destructive" /> Issues Detected
                      </h4>
                      <ul className="space-y-1.5">
                        {(evaluation.issues as any[]).map((issue: any, i: number) => (
                          <li key={i} className="text-sm rounded-md border border-destructive/20 bg-destructive/5 p-2">
                            {typeof issue === "string" ? issue : issue.description || JSON.stringify(issue)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Humanness suggestions */}
                  {evaluation?.humanness_suggestions && (evaluation.humanness_suggestions as any[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Lightbulb className="h-4 w-4 text-yellow-500" /> Humanness Suggestions
                      </h4>
                      <ul className="space-y-1.5">
                        {(evaluation.humanness_suggestions as any[]).map((s: any, i: number) => (
                          <li key={i} className="text-sm rounded-md border p-2 bg-muted/30">
                            {typeof s === "string" ? s : s.suggestion || JSON.stringify(s)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Knowledge gaps */}
                  {evaluation?.knowledge_gaps && (evaluation.knowledge_gaps as any[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4 text-primary" /> Knowledge Gaps
                      </h4>
                      <ul className="space-y-1.5">
                        {(evaluation.knowledge_gaps as any[]).map((g: any, i: number) => (
                          <li key={i} className="text-sm rounded-md border p-2 bg-muted/30">
                            {typeof g === "string" ? g : g.description || JSON.stringify(g)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Transcript */}
                  {call?.transcript && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <FileText className="h-4 w-4" /> Transcript
                      </h4>
                      <ScrollArea className="h-[300px] rounded-md border p-3">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
                          {call.transcript}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Extracted data */}
                  {call?.extracted_data && Object.keys(call.extracted_data).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Extracted Data</h4>
                      <ScrollArea className="h-[200px] rounded-md border p-3">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                          {JSON.stringify(call.extracted_data, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
