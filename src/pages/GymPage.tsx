import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, Play, CheckCircle, XCircle, FileText, Lightbulb, BookOpen } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

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
}

interface TrendPoint {
  date: string;
  humanness: number | null;
  naturalness: number | null;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (!raw.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export default function GymPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>(searchParams.get("agent") || "");
  const [phone, setPhone] = useState("");
  const [running, setRunning] = useState(false);
  const [contact, setContact] = useState<TestContact | null>(null);
  const [testRunId, setTestRunId] = useState<string | null>(null);

  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);

  // Trend data
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

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

  // Load trend data when agent changes
  useEffect(() => {
    if (!agentId) return;
    setTrendLoading(true);

    const loadTrend = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("evaluation, created_at, test_run_id, test_runs!inner(project_id)")
        .eq("test_runs.project_id", agentId)
        .eq("status", "completed")
        .not("evaluation", "is", null)
        .order("created_at", { ascending: true })
        .limit(20);

      const points: TrendPoint[] = (data || []).map((row: any) => ({
        date: new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        humanness: row.evaluation?.humanness_score ?? null,
        naturalness: row.evaluation?.naturalness_score ?? null,
      }));
      setTrendData(points);
      setTrendLoading(false);
    };
    loadTrend();
  }, [agentId, contact]); // re-fetch after a new test completes

  // Realtime subscription for test contact updates
  useEffect(() => {
    if (!testRunId) return;

    const fetchContact = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("*")
        .eq("test_run_id", testRunId)
        .limit(1)
        .single();
      if (data) {
        setContact(data as TestContact);
        if (!["queued", "calling"].includes(data.status)) {
          setRunning(false);
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

    const interval = setInterval(fetchContact, 5000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
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

    try {
      const normalized = normalizePhone(phone.trim());

      const { data: createData, error: createErr } = await supabase.functions.invoke("create-test-run", {
        body: {
          project_id: agentId,
          name: "Gym Test",
          concurrency: 1,
          contacts: [{ name: "Gym Test", phone: normalized }],
        },
      });
      if (createErr) throw createErr;

      const newTestRunId = createData.test_run_id;
      setTestRunId(newTestRunId);

      const { error: runErr } = await supabase.functions.invoke("run-test-run", {
        body: { test_run_id: newTestRunId },
      });
      if (runErr) throw runErr;
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
      setRunning(false);
    }
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
          },
        },
      });
      if (error) throw error;
      setAppliedFixes((prev) => [...prev, improvement.field]);
      toast({ title: "Fix applied!", description: `Agent spec updated to version ${data.to_version}.` });
    } catch (err: any) {
      toast({ title: "Failed to apply fix", description: err.message, variant: "destructive" });
    } finally {
      setApplyingFixId(null);
    }
  };

  const isDone = contact && !["queued", "calling"].includes(contact.status);

  const hasTrendData = trendData.some((p) => p.humanness != null);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gym</h1>
        <p className="text-muted-foreground mt-1">Train and test your agents one-on-one to measure humanness and refine performance.</p>
      </div>

      {/* Form */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
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

        <Button onClick={handleRunTest} disabled={running || !agentId || !phone.trim()} className="w-full">
          {running ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calling...</>
          ) : (
            <><Play className="mr-2 h-4 w-4" /> Run Test Call</>
          )}
        </Button>
      </div>

      {/* Humanness Trend Chart */}
      {hasTrendData && (
        <div className="surface-elevated rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Agent Humanness Progress</h2>
          <p className="text-xs text-muted-foreground">Last 20 evaluated calls. Dashed line = auto-improvement threshold (80).</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
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
      )}

      {/* Results */}
      {contact && (
        <div className="surface-elevated rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Result
            </h2>
            <StatusBadge status={contact.status} />
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

          {contact.evaluation && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-2">
                <ScoreCard label="Compliance" score={contact.evaluation.compliance_score} />
                <ScoreCard label="Objective" score={contact.evaluation.objective_score} />
                <ScoreCard label="Overall" score={contact.evaluation.overall_score} />
                <ScoreCard label="Humanness" score={contact.evaluation.humanness_score} />
                <ScoreCard label="Naturalness" score={contact.evaluation.naturalness_score} />
              </div>

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
                    {contact.evaluation.recommended_improvements.map((imp: any, i: number) => (
                      <li key={i} className="rounded-lg bg-muted/30 border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium">{imp.field}</p>
                            <p className="text-muted-foreground text-xs mt-1">{imp.reason}</p>
                            <p className="mt-2">Suggested: <span className="text-primary">{imp.suggested_value}</span></p>
                          </div>
                          <Button
                            onClick={() => handleApplyFix(imp)}
                            disabled={applyingFixId === imp.field || appliedFixes.includes(imp.field)}
                            size="sm"
                            variant={appliedFixes.includes(imp.field) ? "ghost" : "default"}
                            className="shrink-0"
                          >
                            {applyingFixId === imp.field && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {appliedFixes.includes(imp.field) ? (
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

          {contact.extracted_data && (
            <div className="space-y-1">
              <h5 className="text-xs font-medium text-muted-foreground">Extracted Data</h5>
              <pre className="rounded-lg bg-muted/30 border border-border p-3 text-xs font-mono overflow-auto">
                {JSON.stringify(contact.extracted_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
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
    <div className="rounded-lg bg-muted/30 border border-border p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{score}</p>
    </div>
  );
}
