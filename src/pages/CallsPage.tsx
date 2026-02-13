import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import USMapChart from "@/components/USMapChart";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Phone, ChevronRight, Zap, AlertTriangle, CheckCircle2, TrendingUp, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Call {
  id: string;
  bland_call_id: string | null;
  retell_call_id: string | null;
  voice_provider: string;
  direction: string;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  created_at: string;
  transcript: string | null;
  extracted_data: any;
  summary: any;
  evaluation: any;
  project_id: string;
}

export default function CallsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Call | null>(null);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [dirFilter, setDirFilter] = useState<"all" | "inbound" | "outbound">("all");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setCalls((data as Call[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleApplyImprovement = async (improvement: any, idx: number) => {
    if (!selected) return;
    setApplyingIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke("apply-improvement", {
        body: { project_id: selected.project_id, improvement },
      });
      if (error) throw error;
      toast({
        title: "Improvement Applied",
        description: `v${data.from_version} → v${data.to_version}: ${data.change_summary}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApplyingIdx(null);
    }
  };

  const stateDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    calls.forEach(call => {
      const state = (call.extracted_data as any)?.state;
      if (state && typeof state === 'string') {
        const abbr = state.toUpperCase().trim();
        counts[abbr] = (counts[abbr] || 0) + 1;
      }
    });
    return counts;
  }, [calls]);

  const filteredCalls = useMemo(() => {
    if (dirFilter === "all") return calls;
    return calls.filter((c) => c.direction === dirFilter);
  }, [calls, dirFilter]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const outcomeColor: Record<string, string> = {
    completed: "text-green-400",
    failed: "text-destructive",
    no_answer: "text-yellow-400",
    qualified: "text-primary",
    disqualified: "text-muted-foreground",
  };

  const eval_ = selected?.evaluation;

  return (
    <div className="flex h-full flex-col">
      {!selected && (
        <div className="p-6 border-b border-border">
          <USMapChart stateData={stateDistribution} />
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      <div className={cn("border-r border-border overflow-y-auto", selected ? "w-96" : "w-full")}>
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground">Calls</h1>
          <p className="text-muted-foreground mt-1">{filteredCalls.length} calls</p>
          <Tabs value={dirFilter} onValueChange={(v) => setDirFilter(v as any)} className="mt-3">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="outbound" className="gap-1"><PhoneOutgoing className="h-3 w-3" />Outbound</TabsTrigger>
              <TabsTrigger value="inbound" className="gap-1"><PhoneIncoming className="h-3 w-3" />Inbound</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {filteredCalls.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No {dirFilter !== "all" ? dirFilter : ""} calls yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredCalls.map((call) => (
              <button
                key={call.id}
                onClick={() => setSelected(call)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center justify-between",
                  selected?.id === call.id && "bg-muted/50"
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {call.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-primary" /> : <PhoneOutgoing className="h-3 w-3 text-muted-foreground" />}
                    <p className="text-sm font-medium text-foreground">{call.bland_call_id?.slice(0, 12) || call.retell_call_id?.slice(0, 12) || call.id.slice(0, 8)}...</p>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{call.voice_provider === "retell" ? "Append" : "Voz"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={outcomeColor[call.outcome || ""] || "text-muted-foreground"}>
                      {call.outcome || "pending"}
                    </span>
                    <span className="text-muted-foreground">
                      {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                    </span>
                    {call.evaluation?.overall_score != null && (
                      <span className="text-primary font-medium">{call.evaluation.overall_score}%</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Call Detail</h2>
            <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="surface-elevated rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Outcome</p>
              <p className={cn("text-sm font-semibold", outcomeColor[selected.outcome || ""])}>{selected.outcome || "pending"}</p>
            </div>
            <div className="surface-elevated rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-semibold text-foreground">{selected.duration_seconds ? `${selected.duration_seconds}s` : "—"}</p>
            </div>
          </div>

          {/* Evaluation Scores */}
          {eval_ && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Evaluation
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <ScoreCard label="Compliance" score={eval_.compliance_score} />
                <ScoreCard label="Objective" score={eval_.objective_score} />
                <ScoreCard label="Overall" score={eval_.overall_score} />
              </div>

              {eval_.hallucination_detected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" /> Hallucination detected in this call
                </div>
              )}

              {eval_.issues_detected?.length > 0 && (
                <div className="surface-elevated rounded-lg p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Issues Detected</p>
                  <ul className="space-y-1">
                    {eval_.issues_detected.map((issue: string, i: number) => (
                      <li key={i} className="text-sm text-foreground flex items-start gap-2">
                        <AlertTriangle className="h-3 w-3 text-yellow-400 mt-1 shrink-0" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {eval_.recommended_improvements?.length > 0 && (
                <div className="surface-elevated rounded-lg p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recommended Improvements</p>
                  {eval_.recommended_improvements.map((imp: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                      <p className="text-sm text-foreground"><strong>{imp.field}:</strong> {imp.reason}</p>
                      {imp.suggested_value && (
                        <p className="text-xs text-muted-foreground">Suggested: {typeof imp.suggested_value === "object" ? JSON.stringify(imp.suggested_value) : imp.suggested_value}</p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={applyingIdx === i}
                        onClick={() => handleApplyImprovement(imp, i)}
                      >
                        {applyingIdx === i ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Zap className="mr-2 h-3 w-3" />}
                        Apply Improvement
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selected.extracted_data && (
            <div className="surface-elevated rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Extracted Data</p>
              <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">
                {JSON.stringify(selected.extracted_data, null, 2)}
              </pre>
            </div>
          )}

          {selected.transcript && (
            <div className="surface-elevated rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcript</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selected.transcript}</p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | undefined }) {
  if (score == null) return null;
  const color = score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-destructive";
  return (
    <div className="surface-elevated rounded-lg p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", color)}>{score}%</p>
    </div>
  );
}
