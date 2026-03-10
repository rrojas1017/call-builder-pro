import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, MessageSquarePlus, Pencil, BrainCircuit, ChevronDown, Database } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Phone, Play, CheckCircle, XCircle, FileText, Lightbulb, BookOpen, ArrowUp, ArrowDown, Minus, History, StopCircle, GraduationCap, RotateCcw, Clock, Trophy, TrendingUp, Zap } from "lucide-react";
import LiveCallMonitor from "@/components/LiveCallMonitor";
import SimulationTraining from "@/components/SimulationTraining";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

interface Agent {
  id: string;
  name: string;
}

interface TestContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  transcript: string | null;
  evaluation: any;
  duration_seconds: number | null;
  outcome: string | null;
  error: string | null;
  extracted_data: any;
  recording_url?: string | null;
  user_feedback?: string | null;
  created_at?: string;
  test_run_id?: string;
  retell_call_id?: string | null;
}

interface TrendPoint {
  label: string;
  humanness: number | null;
  naturalness: number | null;
}

async function extractEdgeFunctionError(err: any): Promise<string> {
  try {
    if (err?.context instanceof Response) {
      const body = await err.context.json();
      if (body?.error) return body.error;
    }
  } catch {}
  return err?.message || "Unknown error";
}

const normalizeField = (field: string) =>
  field.replace(/\s*\(.*\)\s*$/, "").replace(/\//g, ".").trim();

const improvementKey = (imp: any) =>
  normalizeField(imp.field) + "::" + JSON.stringify(imp.suggested_value);

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (!raw.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

const PHONE_STORAGE_KEY = "university_last_phone";

interface GraduationLevel {
  label: string;
  min: number;
  max: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const GRADUATION_LEVELS: GraduationLevel[] = [
  { label: "Training", min: 0, max: 59, color: "text-muted-foreground", bgColor: "bg-muted", icon: <GraduationCap className="h-4 w-4" /> },
  { label: "Practicing", min: 60, max: 69, color: "text-yellow-400", bgColor: "bg-yellow-500/10", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "Proficient", min: 70, max: 79, color: "text-blue-400", bgColor: "bg-blue-500/10", icon: <Zap className="h-4 w-4" /> },
  { label: "Advanced", min: 80, max: 89, color: "text-green-400", bgColor: "bg-green-500/10", icon: <Trophy className="h-4 w-4" /> },
  { label: "Graduated", min: 90, max: 100, color: "text-primary", bgColor: "bg-primary/10", icon: <GraduationCap className="h-4 w-4" /> },
];

function getGraduationLevel(avgScore: number | null): GraduationLevel {
  if (avgScore == null) return GRADUATION_LEVELS[0];
  return GRADUATION_LEVELS.find(l => avgScore >= l.min && avgScore <= l.max) || GRADUATION_LEVELS[0];
}

function getProgressToNext(avgScore: number | null): { percent: number; nextLevel: string | null } {
  if (avgScore == null) return { percent: 0, nextLevel: GRADUATION_LEVELS[1].label };
  const currentIdx = GRADUATION_LEVELS.findIndex(l => avgScore >= l.min && avgScore <= l.max);
  if (currentIdx === GRADUATION_LEVELS.length - 1) return { percent: 100, nextLevel: null };
  const current = GRADUATION_LEVELS[currentIdx];
  const next = GRADUATION_LEVELS[currentIdx + 1];
  const range = current.max - current.min + 1;
  const progress = ((avgScore - current.min) / range) * 100;
  return { percent: Math.min(100, Math.max(0, progress)), nextLevel: next.label };
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function UniversityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>(searchParams.get("agent") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem(PHONE_STORAGE_KEY) || "");
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [contact, setContact] = useState<TestContact | null>(null);
  const [testRunId, setTestRunId] = useState<string | null>(searchParams.get("testRunId") || null);

  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);

  // Trend data
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  // History
  const [history, setHistory] = useState<TestContact[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [appliedRefreshKey, setAppliedRefreshKey] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  // Computed stats from history
  const stats = useMemo(() => {
    const evaluated = history.filter(h => h.evaluation?.humanness_score != null);
    const last10 = evaluated.slice(0, 10);
    const avgHumanness = last10.length > 0
      ? Math.round(last10.reduce((sum, h) => sum + (h.evaluation?.humanness_score || 0), 0) / last10.length)
      : null;
    const bestScore = evaluated.length > 0
      ? Math.max(...evaluated.map(h => h.evaluation?.humanness_score || 0))
      : null;
    return {
      totalCalls: history.length,
      avgHumanness,
      bestScore,
      level: getGraduationLevel(avgHumanness),
      progress: getProgressToNext(avgHumanness),
    };
  }, [history]);

  // Save phone to localStorage
  useEffect(() => {
    if (phone.trim()) localStorage.setItem(PHONE_STORAGE_KEY, phone.trim());
  }, [phone]);

  // Fetch applied improvements from DB
  const selectedProjectId = agentId;
  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchApplied = async () => {
      const { data } = await supabase
        .from("improvements")
        .select("patch, source_recommendation")
        .eq("project_id", selectedProjectId);
      const keys: string[] = [];
      (data || []).forEach((row: any) => {
        if (row.source_recommendation) {
          keys.push(row.source_recommendation);
        }
        if (row.patch && typeof row.patch === "object") {
          Object.keys(row.patch).filter(k => k !== "version").forEach(k => {
            keys.push(k + "::" + JSON.stringify(row.patch[k]));
          });
        }
      });
      setAppliedFixes(keys);
    };
    fetchApplied();
  }, [selectedProjectId, appliedRefreshKey]);

  // Reset all state when agent changes
  useEffect(() => {
    setContact(null);
    setTestRunId(null);
    setTrendData([]);
    setHistory([]);
    setSelectedHistoryId(null);
    setAppliedFixes([]);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("testRunId");
      return next;
    }, { replace: true });
  }, [agentId]);

  // Persist testRunId in URL
  const updateUrlParams = useCallback((params: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(params)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Load agents
  useEffect(() => {
    if (!user) return;
    supabase
      .from("agent_projects")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAgents(data || []);
        if (!agentId && data?.length) setAgentId(data[0].id);
      });
  }, [user]);

  // Load history + last result when agent changes
  const loadHistory = useCallback(async () => {
    if (!agentId) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from("test_run_contacts")
      .select("*, test_runs!inner(project_id)")
      .eq("test_runs.project_id", agentId)
      .in("status", ["completed", "cancelled"])
      .not("evaluation", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      status: r.status,
      transcript: r.transcript,
      evaluation: r.evaluation,
      duration_seconds: r.duration_seconds,
      outcome: r.outcome,
      error: r.error,
      extracted_data: r.extracted_data,
      recording_url: r.recording_url,
      created_at: r.created_at,
      test_run_id: r.test_run_id,
      user_feedback: r.user_feedback,
    }));
    setHistory(rows);
    setHistoryLoading(false);
    return rows;
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;

    const init = async () => {
      const rows = await loadHistory();
      if (!running && !contact && rows?.length) {
        const urlTestRunId = searchParams.get("testRunId");
        if (urlTestRunId) {
          const match = rows.find((r) => r.test_run_id === urlTestRunId);
          if (match) {
            setContact(match);
            setTestRunId(urlTestRunId);
            return;
          }
        }
      }
    };
    init();
  }, [agentId]);

  // Load trend data when agent changes
  useEffect(() => {
    if (!agentId) return;
    setTrendLoading(true);

    const loadTrend = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("evaluation, created_at, test_run_id, test_runs!inner(project_id)")
        .eq("test_runs.project_id", agentId)
        .in("status", ["completed", "cancelled"])
        .not("evaluation", "is", null)
        .order("created_at", { ascending: true })
        .limit(20);

      const points: TrendPoint[] = (data || []).map((row: any, idx: number) => ({
        label: `Call ${idx + 1}`,
        humanness: row.evaluation?.humanness_score ?? null,
        naturalness: row.evaluation?.naturalness_score ?? null,
      }));
      setTrendData(points);
      setTrendLoading(false);
    };
    loadTrend();
  }, [agentId, contact]);

  // Realtime subscription for test contact updates
  useEffect(() => {
    if (!testRunId) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let graceTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let callDoneAt: number | null = null;

    const fetchContact = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("*")
        .eq("test_run_id", testRunId)
        .limit(1)
        .single();
      if (data) {
        setContact(data as TestContact);
        const callFinished = !["queued", "calling"].includes(data.status);

        if (callFinished) {
          setRunning(false);

          if (data.evaluation != null) {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            if (graceTimeoutId) { clearTimeout(graceTimeoutId); graceTimeoutId = null; }
            loadHistory();
            return;
          }

          if (!callDoneAt) {
            callDoneAt = Date.now();
            graceTimeoutId = setTimeout(() => {
              if (intervalId) { clearInterval(intervalId); intervalId = null; }
              loadHistory();
            }, 60000);
          }

          if (Date.now() - callDoneAt > 60000) {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            if (graceTimeoutId) { clearTimeout(graceTimeoutId); graceTimeoutId = null; }
            loadHistory();
          }
        }
      }
    };

    fetchContact();

    const channel = supabase
      .channel(`quick-test-${testRunId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_run_contacts",
          filter: `test_run_id=eq.${testRunId}`,
        },
        () => fetchContact()
      )
      .subscribe();

    intervalId = setInterval(fetchContact, 5000);

    return () => {
      channel.unsubscribe();
      if (intervalId) clearInterval(intervalId);
      if (graceTimeoutId) clearTimeout(graceTimeoutId);
    };
  }, [testRunId]);

  const handleRunTest = async () => {
    if (!agentId || !phone.trim()) {
      toast({ title: "Missing info", description: "Select an agent and enter a phone number.", variant: "destructive" });
      return;
    }

    setRunning(true);
    setContact(null);
    setAppliedFixes([]);
    setTestRunId(null);
    setSelectedHistoryId(null);
    try {
      const normalized = normalizePhone(phone.trim());

      const { data: createData, error: createErr } = await supabase.functions.invoke("create-test-run", {
        body: {
          project_id: agentId,
          name: "University Test",
          concurrency: 1,
          contacts: [{ name: "University Test", phone: normalized }],
        },
      });
      if (createErr) {
        const msg = await extractEdgeFunctionError(createErr);
        throw new Error(msg);
      }

      const newTestRunId = createData.test_run_id;
      setTestRunId(newTestRunId);
      updateUrlParams({ testRunId: newTestRunId });

      const { error: runErr } = await supabase.functions.invoke("run-test-run", {
        body: { test_run_id: newTestRunId },
      });
      if (runErr) {
        const msg = await extractEdgeFunctionError(runErr);
        throw new Error(msg);
      }
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
      setRunning(false);
    }
  };

  const handleQuickRetest = () => {
    if (!phone.trim() || !agentId || running) return;
    handleRunTest();
  };

  const handleApplyFix = async (improvement: any) => {
    try {
      setApplyingFixId(improvement.field);
      const { data, error } = await supabase.functions.invoke("apply-improvement", {
        body: {
          project_id: agentId,
          improvement: {
            field: improvement.field,
            suggested_value: improvement.suggested_value,
            reason: improvement.reason,
            original_key: improvementKey(improvement),
          },
        },
      });
      if (error) throw error;
      setAppliedFixes((prev) => [...prev, improvementKey(improvement)]);
      const desc = data.caution
        ? `v${data.to_version} — ⚠️ ${data.caution}`
        : `Agent spec updated to version ${data.to_version}.`;
      toast({ title: "Fix applied!", description: desc });
    } catch (err: any) {
      toast({ title: "Failed to apply fix", description: err.message, variant: "destructive" });
    } finally {
      setApplyingFixId(null);
    }
  };

  const handleSelectHistory = (item: TestContact) => {
    setContact(item);
    setSelectedHistoryId(item.id);
    setTestRunId(item.test_run_id || null);
    setAppliedRefreshKey(k => k + 1);
    if (item.test_run_id) {
      updateUrlParams({ testRunId: item.test_run_id });
    }
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const isDone = contact && !["queued", "calling"].includes(contact.status);

  const hasTrendData = trendData.some((p) => p.humanness != null);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="relative rounded-xl p-6 mesh-gradient">
        <h1 className="text-2xl font-bold text-gradient-primary">University</h1>
        <p className="text-muted-foreground mt-1">Train, test, and graduate your agents — measure humanness and refine performance until they're production-ready.</p>
        <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      {/* Graduation Badge */}
      {agentId && history.length > 0 && (
        <div className={`gradient-border glass-card rounded-xl p-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${stats.level.bgColor} ${stats.level.color} glow-primary`}>
                {stats.level.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${stats.level.label === "Graduated" ? "text-gradient-primary" : stats.level.color}`}>{stats.level.label}</span>
                  {stats.avgHumanness != null && (
                    <span className="text-sm text-muted-foreground font-mono">({stats.avgHumanness} avg)</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.progress.nextLevel
                    ? `${stats.progress.nextLevel} requires ${GRADUATION_LEVELS[GRADUATION_LEVELS.findIndex(l => l.label === stats.progress.nextLevel)]?.min || "—"}+ avg humanness`
                    : "Maximum level achieved!"}
                </p>
              </div>
            </div>
          </div>
          {stats.progress.nextLevel && (
            <div className="mt-3">
              <Progress value={stats.progress.percent} className={`h-2 ${running ? "shimmer-bar" : ""}`} />
            </div>
          )}
        </div>
      )}

      {/* Summary Stats */}
      {agentId && history.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Phone className="h-4 w-4" />} label="Total Calls" value={String(stats.totalCalls)} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Humanness (10)" value={stats.avgHumanness != null ? String(stats.avgHumanness) : "—"} />
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Best Score" value={stats.bestScore != null ? String(stats.bestScore) : "—"} />
          <StatCard icon={<GraduationCap className="h-4 w-4" />} label="Current Level" value={stats.level.label} />
        </div>
      )}

      {/* Form */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Agent</label>
          <Select value={agentId} onValueChange={setAgentId} disabled={running}>
            <SelectTrigger>
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Phone Number</label>
          <Input
            type="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={running}
          />
        </div>

        <Button onClick={handleRunTest} disabled={running || !agentId || !phone.trim()} className="w-full hover:glow-primary transition-all">
          {running ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calling...</>
          ) : (
            <><Play className="mr-2 h-4 w-4" /> Run Test Call</>
          )}
        </Button>

        {running && contact?.retell_call_id && (
          <Button
            variant="destructive"
            className="w-full"
            disabled={stopping}
            onClick={async () => {
              setStopping(true);
              try {
                const { error } = await supabase.functions.invoke("stop-call", {
                  body: { call_id: contact.retell_call_id, contact_id: contact.id, provider: "retell" },
                });
                if (error) throw error;
                setRunning(false);
                toast({ title: "Call stopped", description: "The call has been ended." });
              } catch (err: any) {
                toast({ title: "Failed to stop", description: err.message, variant: "destructive" });
              } finally {
                setStopping(false);
              }
            }}
          >
            {stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
            Stop Call
          </Button>
        )}
      </div>

      {/* Live Call Monitor */}
      {running && contact?.retell_call_id && (
        <LiveCallMonitor
          retellCallId={contact.retell_call_id}
          contactId={contact.id}
          contactStatus={contact.status}
          isActive={running}
        />
      )}

      {/* AI Simulation Training — collapsible */}
      {agentId && (
        <Collapsible>
          <CollapsibleTrigger className="w-full gradient-border glass-card rounded-xl px-5 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">AI Simulation Training</span>
              <Badge variant="secondary" className="text-xs"><Zap className="h-3 w-3 mr-1" />No Phone Needed</Badge>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <SimulationTraining
              projectId={agentId}
              disabled={running}
              onComplete={() => loadHistory()}
            />
          </CollapsibleContent>
        </Collapsible>
      )}


      {/* Humanness Trend Chart */}
      {hasTrendData ? (
        <div className="gradient-border glass-card rounded-xl p-6 space-y-3 mesh-gradient">
          <h2 className="text-lg font-semibold text-gradient-primary">Agent Humanness Progress</h2>
          <p className="text-xs text-muted-foreground">Last 20 evaluated calls. Dashed line = auto-improvement threshold (80).</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine y={80} stroke="hsl(var(--destructive))" strokeDasharray="6 3" label={{ value: "80", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Line type="monotone" dataKey="humanness" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Humanness" connectNulls />
                <Line type="monotone" dataKey="naturalness" stroke="hsl(var(--accent-foreground))" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} name="Naturalness" connectNulls />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : agentId && !trendLoading ? (
        <div className="glass-card rounded-xl p-6 space-y-2 text-center">
          <h2 className="text-lg font-semibold text-gradient-primary">Agent Humanness Progress</h2>
          <p className="text-sm text-muted-foreground">Evaluations pending — scores will appear here after calls are graded.</p>
          <GraduationCap className="h-8 w-8 text-muted-foreground mx-auto mt-2" />
        </div>
      ) : null}

      {/* Results */}
      {contact && (
        <div ref={resultRef}>
        <ResultCard
          contact={contact}
          isDone={isDone}
          running={running}
          applyingFixId={applyingFixId}
          appliedFixes={appliedFixes}
          onApplyFix={handleApplyFix}
          onQuickRetest={handleQuickRetest}
          canRetest={!running && !!phone.trim() && !!agentId}
          projectId={agentId}
        />
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="glass-card rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Call History
          </h2>
          <p className="text-xs text-muted-foreground">Last {history.length} evaluated calls. Click a row to view details.</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Outcome</TableHead>
                  <TableHead className="text-xs text-center">Duration</TableHead>
                  <TableHead className="text-xs text-center">Overall</TableHead>
                  <TableHead className="text-xs text-center">Humanness</TableHead>
                  <TableHead className="text-xs text-center">Naturalness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item, idx) => {
                  const prev = history[idx + 1];
                  const isSelected = selectedHistoryId === item.id;
                  return (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"} ${idx % 2 === 1 ? "bg-muted/10" : ""}`}
                      onClick={() => handleSelectHistory(item)}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.outcome || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground font-mono">
                        {formatDuration(item.duration_seconds)}
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreWithDelta score={item.evaluation?.overall_score} prevScore={prev?.evaluation?.overall_score} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreWithDelta score={item.evaluation?.humanness_score} prevScore={prev?.evaluation?.humanness_score} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreWithDelta score={item.evaluation?.naturalness_score} prevScore={prev?.evaluation?.naturalness_score} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card hover-lift rounded-xl p-4 flex items-center gap-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
      <div className="text-primary glow-primary rounded-lg p-1.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground font-mono tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function ScoreWithDelta({ score, prevScore }: { score?: number; prevScore?: number }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-destructive";
  const delta = prevScore != null ? score - prevScore : null;

  return (
    <span className={`text-xs font-semibold ${color} inline-flex items-center gap-0.5`}>
      {score}
      {delta != null && delta !== 0 && (
        delta > 0
          ? <ArrowUp className="h-3 w-3 text-green-400" />
          : <ArrowDown className="h-3 w-3 text-destructive" />
      )}
    </span>
  );
}

function ResultCard({
  contact,
  isDone,
  running,
  applyingFixId,
  appliedFixes,
  onApplyFix,
  onQuickRetest,
  canRetest,
}: {
  contact: TestContact;
  isDone: boolean | null;
  running: boolean;
  applyingFixId: string | null;
  appliedFixes: string[];
  onApplyFix: (imp: any) => void;
  onQuickRetest: () => void;
  canRetest: boolean;
}) {
  const [feedbackText, setFeedbackText] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast: feedbackToast } = useToast();

  // Load existing feedback when contact changes
  useEffect(() => {
    const existing = contact.user_feedback || null;
    setSavedFeedback(existing);
    setFeedbackText(existing || "");
    setEditingFeedback(false);
  }, [contact.id]);

  const handleSaveFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSavingFeedback(true);
    try {
      const { error } = await supabase
        .from("test_run_contacts")
        .update({ user_feedback: feedbackText.trim() })
        .eq("id", contact.id);
      if (error) throw error;
      setSavedFeedback(feedbackText.trim());
      setEditingFeedback(false);
      feedbackToast({ title: "Feedback saved", description: "Your feedback will be included in the next evaluation." });
    } catch (err: any) {
      feedbackToast({ title: "Failed to save feedback", description: err.message, variant: "destructive" });
    } finally {
      setSavingFeedback(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeAudio(blob);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      feedbackToast({ title: "Microphone access denied", description: "Please allow microphone access to record feedback.", variant: "destructive" });
    }
  }, [feedbackToast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const { data, error } = await supabase.functions.invoke("transcribe-and-ingest", {
        body: { audio_base64: base64, mode: "transcribe_only" },
      });
      if (error) throw error;
      const transcribedText = data?.text || data?.transcript || "";
      if (transcribedText) {
        setFeedbackText(prev => prev ? prev + "\n" + transcribedText : transcribedText);
      } else {
        feedbackToast({ title: "No speech detected", description: "Try recording again with clearer audio.", variant: "destructive" });
      }
    } catch (err: any) {
      feedbackToast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  }, [feedbackToast]);

  const isTerminal = ["completed", "cancelled"].includes(contact.status);
  const showFeedbackInput = isTerminal && (!savedFeedback || editingFeedback);
  const showSavedFeedback = isTerminal && savedFeedback && !editingFeedback;

  return (
    <div className="gradient-border glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Result
        </h2>
        <div className="flex items-center gap-2">
          {isDone && canRetest && (
            <Button variant="outline" size="sm" onClick={onQuickRetest}>
              <RotateCcw className="mr-1 h-3 w-3" /> Re-test
            </Button>
          )}
          <StatusBadge status={contact.status} />
        </div>
      </div>

      {contact.error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {contact.error}
        </div>
      )}

      {!isDone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for call to complete…
        </div>
      )}

      {contact.transcript && (
        <div className="space-y-1">
          <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" /> Transcript
          </h5>
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
            {contact.transcript}
          </div>
        </div>
      )}

      {contact.recording_url && (
        <RecordingPlayer url={contact.recording_url} />
      )}

      {isTerminal && !contact.evaluation && (
        <GradingProgress hasTranscript={!!contact.transcript} />
      )}

      {contact.evaluation && (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            <ScoreCard label="Compliance" score={contact.evaluation.compliance_score} />
            <ScoreCard label="Objective" score={contact.evaluation.objective_score} />
            <ScoreCard label="Overall" score={contact.evaluation.overall_score} />
            <ScoreCard label="Humanness" score={contact.evaluation.humanness_score} />
            <ScoreCard label="Naturalness" score={contact.evaluation.naturalness_score} />
          </div>

          {contact.evaluation.voice_recommendation && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-primary flex items-center gap-1">🎙️ Voice Recommendation</p>
              <p className="text-xs text-foreground">{contact.evaluation.voice_recommendation.reason}</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Current: <strong>{contact.evaluation.voice_recommendation.current_voice}</strong> ({contact.evaluation.voice_recommendation.current_avg_humanness})</span>
                <span className="text-primary">→ <strong>{contact.evaluation.voice_recommendation.suggested_voice}</strong> ({contact.evaluation.voice_recommendation.suggested_avg_humanness})</span>
              </div>
            </div>
          )}

          {contact.evaluation.issues_detected?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Issues</p>
              <ul className="text-xs text-foreground space-y-1">
                {contact.evaluation.issues_detected.map((issue: string, i: number) => (
                  <li key={i} className="flex items-start gap-1">
                    <XCircle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contact.evaluation.humanness_suggestions?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Lightbulb className="h-3 w-3" /> Humanness Suggestions
              </p>
              <ul className="text-xs text-foreground space-y-1">
                {contact.evaluation.humanness_suggestions.map((tip: string, i: number) => (
                  <li key={i} className="flex items-start gap-1">
                    <Lightbulb className="h-3 w-3 mt-0.5 text-yellow-400 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contact.evaluation.knowledge_gaps?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> Knowledge Gaps
              </p>
              <ul className="text-xs text-foreground space-y-1">
                {contact.evaluation.knowledge_gaps.map((gap: string, i: number) => (
                  <li key={i} className="flex items-start gap-1">
                    <BookOpen className="h-3 w-3 mt-0.5 text-orange-400 shrink-0" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contact.evaluation.recommended_improvements?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recommended Improvements</p>
              <ul className="text-xs text-foreground space-y-2">
                {[...contact.evaluation.recommended_improvements]
                  .sort((a: any, b: any) => {
                    const order: Record<string, number> = { critical: 0, important: 1, minor: 2 };
                    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
                  })
                  .map((imp: any, i: number) => (
                  <li key={i} className="rounded-lg bg-muted/30 border-l-2 border-border p-3" style={{ borderLeftColor: imp.severity === 'critical' ? 'hsl(var(--destructive))' : imp.severity === 'important' ? 'hsl(38 92% 50%)' : 'hsl(var(--border))' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{imp.field}</p>
                          <SeverityBadge severity={imp.severity} />
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">{imp.reason}</p>
                        <p className="mt-2">Suggested: <span className="text-primary">{imp.suggested_value}</span></p>
                      </div>
                      <Button
                        onClick={() => onApplyFix(imp)}
                        disabled={applyingFixId === imp.field || appliedFixes.includes(improvementKey(imp))}
                        size="sm"
                        variant={appliedFixes.includes(improvementKey(imp)) ? "ghost" : "default"}
                        className="shrink-0"
                      >
                        {applyingFixId === imp.field && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {appliedFixes.includes(improvementKey(imp)) ? (
                          <><CheckCircle className="mr-1 h-3 w-3" /> Applied</>
                        ) : (
                          "Apply Fix"
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Your Feedback — chat-style with voice recording */}
      {showFeedbackInput && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <MessageSquarePlus className="h-3 w-3" /> Add Your Feedback
          </h5>
          <p className="text-[11px] text-muted-foreground">
            Share what you noticed during this call. Your feedback will be factored into the evaluation and agent improvements.
          </p>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="e.g., 'The agent was too pushy about scheduling', 'Great job handling the objection about pricing'..."
            className="min-h-[60px] text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveFeedback}
              disabled={savingFeedback || !feedbackText.trim()}
              size="sm"
              className="h-7 text-xs"
            >
              {savingFeedback ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              {savedFeedback ? "Update Feedback" : "Submit Feedback"}
            </Button>
            <Button
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
            >
              {transcribing ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Transcribing...</>
              ) : recording ? (
                <><MicOff className="mr-1 h-3 w-3 text-destructive" /> Stop Recording</>
              ) : (
                <><Mic className="mr-1 h-3 w-3" /> Record Feedback</>
              )}
            </Button>
            {editingFeedback && savedFeedback && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingFeedback(false); setFeedbackText(savedFeedback); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {showSavedFeedback && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquarePlus className="h-3 w-3" /> Your Feedback
            </h5>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingFeedback(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-foreground whitespace-pre-wrap">
            {savedFeedback}
          </div>
        </div>
      )}

      {contact.extracted_data && (
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center justify-between py-1 group">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <h5 className="text-xs font-medium text-muted-foreground">Extracted Data</h5>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 rounded-lg bg-muted/30 border border-border p-3 text-xs font-mono overflow-auto">
              {JSON.stringify(contact.extracted_data, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    calling: "bg-primary/10 text-primary border-primary/20",
    queued: "bg-muted text-muted-foreground border-border",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <Badge variant="outline" className={variants[status] || variants.failed}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function ScoreCard({ label, score }: { label: string; score?: number }) {
  if (score == null) return null;
  const color = score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-destructive";
  return (
    <div className="rounded-lg bg-gradient-to-br from-muted/40 to-muted/20 border border-border/50 p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{score}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const styles: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    important: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    minor: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${styles[severity] || styles.minor}`}>
      {severity}
    </span>
  );
}

function RecordingPlayer({ url }: { url: string }) {
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speeds = [1, 1.25, 1.5, 2];

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  return (
    <div className="space-y-2">
      <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        🎧 Call Recording
      </h5>
      <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-2">
        <audio
          ref={audioRef}
          src={url}
          controls
          className="w-full h-8"
          onPlay={() => { if (audioRef.current) audioRef.current.playbackRate = speed; }}
        />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Speed:</span>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                speed === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GradingProgress({ hasTranscript }: { hasTranscript: boolean }) {
  const steps = [
    { label: "Transcript received", done: hasTranscript },
    { label: "Evaluating performance", done: false, active: hasTranscript },
    { label: "Calculating graduation level", done: false, active: false },
  ];

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-primary animate-pulse" />
        <p className="text-sm font-medium text-foreground">Grading in progress…</p>
      </div>
      <p className="text-xs text-muted-foreground">Analyzing transcript and scoring performance</p>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
            ) : step.active ? (
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
            )}
            <span className={step.done ? "text-foreground" : step.active ? "text-primary font-medium" : "text-muted-foreground"}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
