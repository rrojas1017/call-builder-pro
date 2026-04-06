import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Play, Pause, RefreshCw, Trash2, PhoneOff, Save, FileText, Phone, ExternalLink, AlertTriangle, Lightbulb, BookOpen, ShieldCheck, RotateCcw, Pencil, Download, ChevronDown, Filter } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { downloadRecordingMp3 } from "@/lib/recordingDownload";
import LiveCallMonitor from "@/components/LiveCallMonitor";
import CampaignScheduleEditor from "@/components/CampaignScheduleEditor";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Label as RechartsLabel } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Users, CheckCircle, TrendingUp, Star, Clock, XCircle, RotateCw, Zap, HeadphonesIcon } from "lucide-react";

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
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [editingAgent, setEditingAgent] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);

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

    // Fetch all agents for the selector and the assigned agent
    const { data: agentsData } = await supabase.from("agent_projects").select("id, name").order("name");
    setAllAgents(agentsData || []);

    if (campRes.data?.agent_project_id) {
      const ag = (agentsData || []).find((a: any) => a.id === campRes.data.agent_project_id);
      setAgent(ag || null);
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
      toast({ title: "Campaign deleted", description: "Call records and CRM data have been preserved." });
      navigate("/campaigns");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setActionLoading(false);
    }
  };

  const [resetStats, setResetStats] = useState<{ toRequeue: number; toSkip: number } | null>(null);

  const computeResetStats = async () => {
    // Find contacts with successful call outcomes to skip
    const { data: successCalls } = await supabase
      .from("calls")
      .select("contact_id")
      .eq("campaign_id", id)
      .in("outcome", ["qualified", "transfer_completed"]);
    const successContactIds = new Set((successCalls || []).map((c: any) => c.contact_id).filter(Boolean));
    const total = contacts.length;
    const toSkip = contacts.filter((c: any) => successContactIds.has(c.id)).length;
    setResetStats({ toRequeue: total - toSkip, toSkip });
    return { successContactIds };
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      // Find successful contacts to skip
      const { data: successCalls } = await supabase
        .from("calls")
        .select("contact_id")
        .eq("campaign_id", id)
        .in("outcome", ["qualified", "transfer_completed"]);
      const successContactIds = (successCalls || []).map((c: any) => c.contact_id).filter(Boolean);

      // Build query to reset non-successful contacts only
      let query = supabase
        .from("contacts")
        .update({
          status: "queued",
          attempts: 0,
          called_at: null,
          bland_call_id: null,
          last_error: null,
        } as any)
        .eq("campaign_id", id);

      if (successContactIds.length > 0) {
        // Exclude successful contacts from reset
        query = query.not("id", "in", `(${successContactIds.join(",")})`);
      }

      const { error: contactErr } = await query;
      if (contactErr) throw contactErr;

      // Reset campaign status
      const { error: campErr } = await supabase
        .from("campaigns")
        .update({ status: "draft" })
        .eq("id", id);
      if (campErr) throw campErr;

      setCampaign((prev: any) => ({ ...prev, status: "draft" }));
      const skipped = successContactIds.length;
      toast({
        title: "Campaign reset",
        description: skipped > 0
          ? `${contacts.length - skipped} contacts re-queued. ${skipped} successful contacts preserved.`
          : "All contacts re-queued. Historical call data preserved.",
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error resetting", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
      setResetStats(null);
    }
  };

  const startEditing = () => {
    setEditForm({
      name: campaign.name,
      max_concurrent_calls: campaign.max_concurrent_calls,
      max_attempts: campaign.max_attempts,
      redial_delay_minutes: campaign.redial_delay_minutes,
      redial_statuses: campaign.redial_statuses || [],
      hipaa_enabled: campaign.hipaa_enabled,
      is_test: campaign.is_test,
      voicemail_message: campaign.voicemail_message || "",
      webhook_url: campaign.webhook_url || "",
      schedule_enabled: campaign.schedule_enabled || false,
      schedule_days: campaign.schedule_days || ["mon", "tue", "wed", "thu", "fri"],
      schedule_start_time: campaign.schedule_start_time || "09:00",
      schedule_end_time: campaign.schedule_end_time || "17:00",
      schedule_timezone: campaign.schedule_timezone || "America/New_York",
      schedule_day_overrides: campaign.schedule_day_overrides || {},
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({
          name: editForm.name,
          max_concurrent_calls: editForm.max_concurrent_calls,
          max_attempts: editForm.max_attempts,
          redial_delay_minutes: editForm.redial_delay_minutes,
          redial_statuses: editForm.redial_statuses,
          hipaa_enabled: editForm.hipaa_enabled,
          is_test: editForm.is_test,
          voicemail_message: editForm.voicemail_message || null,
          webhook_url: editForm.webhook_url || null,
          schedule_enabled: editForm.schedule_enabled,
          schedule_days: editForm.schedule_days,
          schedule_start_time: editForm.schedule_start_time,
          schedule_end_time: editForm.schedule_end_time,
          schedule_timezone: editForm.schedule_timezone,
          schedule_day_overrides: editForm.schedule_day_overrides,
        } as any)
        .eq("id", id);
      if (error) throw error;
      setCampaign((prev: any) => ({ ...prev, ...editForm, voicemail_message: editForm.voicemail_message || null }));
      setIsEditing(false);
      toast({ title: "Campaign updated" });
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStopCall = async (callId: string, contactId: string, provider: string = "retell") => {
    setStoppingCalls((prev) => new Set(prev).add(contactId));
    try {
      const { error } = await supabase.functions.invoke("stop-call", {
        body: { call_id: callId, contact_id: contactId, provider },
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

  const liveCalls = contacts.filter((c) => c.status === "calling");

  const exportContacts = (filter: string, outcomes?: string[], listId?: string) => {
    let filtered = contacts;
    if (filter === "successful") {
      filtered = contacts.filter((c) => {
        const call = calls.find((cl: any) => cl.contact_id === c.id);
        const o = resolveOutcome(c, call);
        return ["qualified", "transfer_completed", "completed"].includes(o || "");
      });
    } else if (filter === "outcome" && outcomes?.length) {
      filtered = contacts.filter((c) => {
        const call = calls.find((cl: any) => cl.contact_id === c.id);
        const o = resolveOutcome(c, call);
        return outcomes.includes(o || "");
      });
    } else if (filter === "list" && listId) {
      filtered = contacts.filter((c) => c.list_id === listId);
    }

    // Collect all extracted_data keys dynamically
    const allExtractedKeys = new Set<string>();
    filtered.forEach((c) => {
      const call = calls.find((cl: any) => cl.contact_id === c.id);
      if (call?.extracted_data && typeof call.extracted_data === "object") {
        Object.keys(call.extracted_data).forEach((k) => allExtractedKeys.add(k));
      }
    });
    const extractedKeysArr = Array.from(allExtractedKeys);

    const headers = ["Contact Name", "Phone", "Status", "Outcome", "Duration (s)", "Transcript", "Score", "Recording URL", "Called At", ...extractedKeysArr];
    const rows = filtered.map((c: any) => {
      const call = calls.find((cl: any) => cl.contact_id === c.id);
      const outcome = resolveOutcome(c, call);
      const extractedVals = extractedKeysArr.map((k) => {
        const v = call?.extracted_data?.[k];
        return v != null ? String(v).replace(/"/g, '""') : "";
      });
      return [
        c.name, c.phone, c.status, outcome || "", call?.duration_seconds ?? "",
        (call?.transcript || "").replace(/"/g, '""'),
        call?.evaluation?.overall_score ?? "", call?.recording_url || "", c.called_at || "",
        ...extractedVals,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.short_id || "campaign"}-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${filtered.length} contacts` });
  };

  const handleStopAll = async () => {
    for (const c of liveCalls) {
      const activeCallId = (c as any).retell_call_id;
      const callProvider = "retell";
      if (activeCallId) {
        handleStopCall(activeCallId, c.id, callProvider);
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

  const heroKpis = [
    { label: "Total Contacts", value: total, icon: Users, color: "text-foreground" },
    { label: "Qualified", value: qualified, icon: CheckCircle, color: "text-green-600 dark:text-green-400" },
    { label: "Conversion Rate", value: `${conversionRate}%`, icon: TrendingUp, color: conversionRate > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground" },
    { label: "Avg Score", value: avgScore > 0 ? `${avgScore}` : "—", icon: Star, color: avgScore >= 70 ? "text-green-600 dark:text-green-400" : avgScore >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground" },
  ];

  const secondaryKpis = [
    { label: "In Progress", value: inProgress, color: "text-primary" },
    { label: "Terminal", value: terminal, color: "text-foreground" },
    { label: "Retryable", value: retryable, color: "text-yellow-600 dark:text-yellow-400" },
    { label: "Failed", value: failed, color: "text-destructive" },
    { label: "Avg Duration", value: avgDuration > 0 ? `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s` : "—", color: "text-muted-foreground" },
  ];

  const chartConfig = pieData.reduce((acc, item, i) => {
    acc[item.name] = { label: item.name, color: COLORS[i % COLORS.length] };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header with mesh gradient background */}
      <div className="mesh-gradient rounded-xl p-6 -mx-6 md:-mx-8 -mt-6 md:-mt-8 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link to="/campaigns" className="text-muted-foreground hover:text-foreground mt-1.5 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {campaign.short_id && <Badge variant="outline" className="mr-2 text-xs font-mono align-middle">{campaign.short_id}</Badge>}
                {campaign.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[campaign.status] || "bg-muted text-muted-foreground"}`}>
                  {campaign.status.toUpperCase()}
                </span>
                {campaign.hipaa_enabled && (
                  <Badge variant="outline" className="gap-1 text-xs border-primary/50 text-primary rounded-full px-3 py-1">
                    <ShieldCheck className="h-3 w-3" /> HIPAA
                  </Badge>
                )}
                {campaign.is_test && (
                  <Badge variant="outline" className="gap-1 text-xs border-yellow-500/50 text-yellow-600 dark:text-yellow-400 rounded-full px-3 py-1">
                    <AlertTriangle className="h-3 w-3" /> TEST
                  </Badge>
                )}
                {editingAgent ? (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-secondary/80 rounded-full px-2 py-0.5">
                    <HeadphonesIcon className="h-3 w-3 text-muted-foreground" />
                    <Select value={selectedAgentId || ""} onValueChange={setSelectedAgentId}>
                      <SelectTrigger className="h-5 w-40 text-xs border-0 bg-transparent p-0">
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {allAgents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1"
                      disabled={savingAgent || !selectedAgentId}
                      onClick={async () => {
                        setSavingAgent(true);
                        await supabase.from("campaigns").update({
                          project_id: selectedAgentId,
                          agent_project_id: selectedAgentId,
                        }).eq("id", id);
                        const ag = allAgents.find((a: any) => a.id === selectedAgentId);
                        setAgent(ag || null);
                        setCampaign((prev: any) => ({ ...prev, project_id: selectedAgentId, agent_project_id: selectedAgentId }));
                        setEditingAgent(false);
                        setSavingAgent(false);
                        toast({ title: "Agent updated" });
                      }}
                    >
                      {savingAgent ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                  </span>
                ) : (
                  <button
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/80 rounded-full px-3 py-1 cursor-pointer hover:bg-secondary"
                    onClick={() => { setSelectedAgentId(campaign.agent_project_id || campaign.project_id); setEditingAgent(true); }}
                  >
                    <HeadphonesIcon className="h-3 w-3" /> {agent?.name || "No agent"}
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/80 rounded-full px-3 py-1">
                  <Clock className="h-3 w-3" /> {new Date(campaign.created_at).toLocaleDateString()}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/80 rounded-full px-3 py-1">
                  <Zap className="h-3 w-3" />
                  Concurrency:
                  {editConcurrency !== null ? (
                    <span className="inline-flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={editConcurrency}
                        onChange={(e) => setEditConcurrency(Math.max(1, Math.min(100, Number(e.target.value))))}
                        className="w-14 h-5 text-xs inline-block"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1"
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
                    </span>
                  ) : (
                    <button
                      className="underline decoration-dotted cursor-pointer hover:text-foreground font-medium"
                      onClick={() => setEditConcurrency(campaign.max_concurrent_calls || 1)}
                    >
                      {campaign.max_concurrent_calls || 1}
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm rounded-full px-2 py-1.5 border border-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="rounded-full h-8">
                  <Download className="h-4 w-4 mr-1" /> Export <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => exportContacts("all")}>
                  <Download className="h-4 w-4 mr-2" /> All Contacts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportContacts("successful")}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Successful Only
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Filter className="h-4 w-4 mr-2" /> By Outcome
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {["qualified", "disqualified", "completed", "voicemail", "no_answer", "busy", "dnc", "disconnected", "failed", "call_me_later"].map((o) => (
                      <DropdownMenuItem key={o} onClick={() => exportContacts("outcome", [o])}>
                        {o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {lists.length > 1 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FileText className="h-4 w-4 mr-2" /> By List
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {lists.map((l: any) => (
                        <DropdownMenuItem key={l.id} onClick={() => exportContacts("list", [], l.id)}>
                          {l.short_id && <span className="font-mono text-xs mr-1">{l.short_id}</span>}
                          {l.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={fetchData} className="rounded-full h-8">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            {(campaign.status === "draft" || campaign.status === "paused") && !isEditing && (
              <Button size="sm" variant="ghost" onClick={startEditing} className="rounded-full h-8">
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            {(campaign.status === "paused" || campaign.status === "completed") && (
              <AlertDialog onOpenChange={(open) => { if (open) computeResetStats(); else setResetStats(null); }}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={resetting} className="rounded-full h-8">
                    {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Campaign</AlertDialogTitle>
                    <AlertDialogDescription>
                      {resetStats ? (
                        <>
                          <strong>{resetStats.toRequeue}</strong> contacts will be re-queued.
                          {resetStats.toSkip > 0 && (
                            <> <strong>{resetStats.toSkip}</strong> successful contacts (qualified/transferred) will be <strong>preserved</strong>.</>
                          )}
                          <br />Historical call records and CRM data will NOT be affected.
                        </>
                      ) : (
                        "Calculating contacts..."
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>Reset Campaign</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {(campaign.status === "draft" || campaign.status === "paused") && (
              <Button size="sm" onClick={handleStart} disabled={actionLoading} className="rounded-full h-8">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {campaign.status === "paused" ? "Resume" : "Start"}
              </Button>
            )}
            {campaign.status === "running" && (
              <Button size="sm" variant="outline" onClick={handlePause} disabled={actionLoading} className="rounded-full h-8">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                Pause
              </Button>
            )}
            {campaign.status !== "running" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={actionLoading} className="rounded-full h-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this campaign and all its contact data. Call records and CRM data will be preserved as historical data. This action cannot be undone.
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
      </div>

      {/* Edit form */}
      {isEditing && (
        <Card className="rounded-xl border-primary/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Edit Campaign</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="rounded-full">Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="rounded-full">
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f: any) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Concurrent Calls</Label>
                <Input type="number" min={1} max={100} value={editForm.max_concurrent_calls} onChange={(e) => setEditForm((f: any) => ({ ...f, max_concurrent_calls: Math.max(1, Math.min(100, Number(e.target.value))) }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Attempts</Label>
                <Input type="number" min={1} max={10} value={editForm.max_attempts} onChange={(e) => setEditForm((f: any) => ({ ...f, max_attempts: Math.max(1, Math.min(10, Number(e.target.value))) }))} />
              </div>
              <div className="space-y-2">
                <Label>Redial Delay (minutes)</Label>
                <Input type="number" min={1} max={1440} value={editForm.redial_delay_minutes} onChange={(e) => setEditForm((f: any) => ({ ...f, redial_delay_minutes: Math.max(1, Math.min(1440, Number(e.target.value))) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Retryable Statuses</Label>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: "voicemail", label: "Voicemail" },
                  { value: "no_answer", label: "No Answer" },
                  { value: "busy", label: "Busy" },
                  { value: "call_me_later", label: "Call Me Later" },
                  { value: "not_available", label: "Not Available" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(editForm.redial_statuses || []).includes(opt.value)}
                      onChange={(e) => {
                        setEditForm((f: any) => ({
                          ...f,
                          redial_statuses: e.target.checked
                            ? [...(f.redial_statuses || []), opt.value]
                            : (f.redial_statuses || []).filter((s: string) => s !== opt.value),
                        }));
                      }}
                      className="rounded border-input"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={editForm.hipaa_enabled} onCheckedChange={(v) => setEditForm((f: any) => ({ ...f, hipaa_enabled: v }))} />
                <Label>HIPAA Mode</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editForm.is_test} onCheckedChange={(v) => setEditForm((f: any) => ({ ...f, is_test: v }))} />
                <Label>Test Mode</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Voicemail Message</Label>
              <Textarea
                value={editForm.voicemail_message}
                onChange={(e) => setEditForm((f: any) => ({ ...f, voicemail_message: e.target.value }))}
                placeholder="Leave empty to disable voicemail"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>CRM Webhook URL</Label>
              <Input
                value={editForm.webhook_url}
                onChange={(e) => setEditForm((f: any) => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://hooks.zapier.com/... or any webhook endpoint"
                type="url"
              />
              <p className="text-xs text-muted-foreground">Successful calls (qualified, transferred, completed) will be POSTed here automatically.</p>
            </div>
            <CampaignScheduleEditor
              value={{
                schedule_enabled: editForm.schedule_enabled,
                schedule_days: editForm.schedule_days,
                schedule_start_time: editForm.schedule_start_time,
                schedule_end_time: editForm.schedule_end_time,
                schedule_timezone: editForm.schedule_timezone,
                schedule_day_overrides: editForm.schedule_day_overrides,
              }}
              onChange={(sched) => setEditForm((f: any) => ({ ...f, ...sched }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Enhanced Progress Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{processed} of {total} contacts processed</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, hsl(24 85% 50%), hsl(38 92% 50%))",
              }}
            />
            {campaign.status === "running" && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "linear-gradient(90deg, transparent, hsla(0,0%,100%,0.2), transparent)",
                  animation: "shimmer 2s infinite",
                }}
              />
            )}
          </div>
        </div>
        <span className="text-3xl font-bold tabular-nums text-gradient-primary min-w-[4ch] text-right">{progressPct}%</span>
      </div>

      {/* Hero KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {heroKpis.map((k) => (
          <div key={k.label} className="gradient-border rounded-xl hover-lift">
            <CardContent className="p-5 relative overflow-hidden">
              <k.icon className="absolute -right-2 -top-2 h-16 w-16 text-muted-foreground/5" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
              <p className={`text-3xl font-bold mt-1 tabular-nums ${k.color}`}>{k.value}</p>
            </CardContent>
          </div>
        ))}
      </div>

      {/* Secondary metrics row */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {secondaryKpis.map((k) => (
          <div key={k.label} className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-4 py-2">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className={`text-sm font-semibold tabular-nums ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Live Calls - Glass Card */}
      {liveCalls.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              Live Calls ({liveCalls.length})
            </h3>
            <Button size="sm" variant="destructive" onClick={handleStopAll} className="rounded-full">
              <PhoneOff className="h-4 w-4 mr-1" /> Stop All
            </Button>
          </div>
          <div className="space-y-2">
            {liveCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border-l-4 border-l-green-500 bg-card/80 border border-border/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
                </div>
                {(c as any).retell_call_id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={stoppingCalls.has(c.id)}
                    onClick={() => handleStopCall((c as any).retell_call_id, c.id, "retell")}
                    className="rounded-full"
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
                    className="rounded-full"
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
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        {pieData.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-base">Outcome Distribution</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[260px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <RechartsLabel
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                                {total}
                              </tspan>
                              <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} className="fill-muted-foreground text-xs">
                                contacts
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                  <Legend />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Per-list breakdown with progress bars */}
        {listStats.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-base">Performance by List</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>List</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="w-[120px]">Rate</TableHead>
                    <TableHead className="text-right">Avg Dur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listStats.map((ls, i) => (
                    <TableRow key={ls.name} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <TableCell className="font-medium">{ls.name}</TableCell>
                      <TableCell className="text-right">{ls.total}</TableCell>
                      <TableCell className="text-right">{ls.completed}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${ls.rate}%`,
                                background: "linear-gradient(90deg, hsl(24 85% 50%), hsl(38 92% 50%))",
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-8 text-right">{ls.rate}%</span>
                        </div>
                      </TableCell>
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
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Contacts ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
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
                  const borderColor = outcomeValue === "qualified" ? "border-l-green-500" : outcomeValue === "failed" ? "border-l-destructive" : outcomeValue === "disqualified" ? "border-l-destructive" : "border-l-transparent";
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-muted/50 border-l-4 ${borderColor} transition-colors`}
                      onClick={() => setSelectedContactId(c.id)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
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
                  <SheetTitle className="flex items-center gap-2 text-lg">
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
                      <div className={`flex items-center gap-2 rounded-xl border p-3 ${color}`}>
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
                    retellCallId={call?.retell_call_id}
                    contactId={contact.id}
                    isActive={true}
                  />
                )}

                <div className="space-y-5 mt-4">
                  {/* Call metadata */}
                  {call && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border p-3">
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-medium">
                          {call.duration_seconds != null
                            ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3">
                        <p className="text-xs text-muted-foreground">Outcome</p>
                        <p className="font-medium">{call.outcome || "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* Recording */}
                  {call?.recording_url && (
                    <div className="flex items-center gap-2">
                      <a
                        href={call.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-4 py-2 transition-colors font-medium"
                      >
                        <ExternalLink className="h-4 w-4" /> Listen to Recording
                      </a>
                      <button
                        onClick={() => downloadRecordingMp3(call.recording_url!, `campaign-call-${call.id}.mp3`, call?.retell_call_id)}
                        className="inline-flex items-center gap-1.5 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-full px-4 py-2 transition-colors font-medium"
                      >
                        <Download className="h-4 w-4" /> Download
                      </button>
                    </div>
                  )}

                  {/* Evaluation scores - Circular progress rings */}
                  {evaluation && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Evaluation Scores</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { label: "Overall", value: evaluation.overall_score },
                          { label: "Compliance", value: evaluation.compliance_score },
                          { label: "Objective", value: evaluation.objective_score },
                          { label: "Humanness", value: evaluation.humanness_score },
                          { label: "Naturalness", value: evaluation.naturalness_score },
                        ].map((s) => {
                          const scoreVal = s.value ?? 0;
                          const circumference = 2 * Math.PI * 28;
                          const offset = circumference - (circumference * scoreVal) / 100;
                          const ringColor = scoreVal >= 70 ? "stroke-green-500" : scoreVal >= 40 ? "stroke-yellow-500" : "stroke-destructive";
                          return (
                            <div key={s.label} className="rounded-xl border p-3 text-center">
                              <div className="relative w-16 h-16 mx-auto mb-1">
                                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                                  <circle cx="32" cy="32" r="28" fill="none" strokeWidth="4" className="stroke-secondary" />
                                  {s.value != null && (
                                    <circle
                                      cx="32" cy="32" r="28" fill="none" strokeWidth="4"
                                      className={ringColor}
                                      strokeDasharray={circumference}
                                      strokeDashoffset={offset}
                                      strokeLinecap="round"
                                    />
                                  )}
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                                  {s.value ?? "—"}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{s.label}</p>
                            </div>
                          );
                        })}
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
                          <li key={i} className="text-sm rounded-xl border border-destructive/20 bg-destructive/5 p-2">
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
                          <li key={i} className="text-sm rounded-xl border p-2 bg-muted/30">
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
                          <li key={i} className="text-sm rounded-xl border p-2 bg-muted/30">
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
                      <ScrollArea className="h-[300px] rounded-xl border p-3">
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
                      <ScrollArea className="h-[200px] rounded-xl border p-3">
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

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
