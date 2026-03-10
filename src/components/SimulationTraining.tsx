import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Play, Bot, BrainCircuit, ChevronDown, CheckCircle, XCircle,
  ArrowUp, ArrowDown, Minus, RotateCcw, Zap, Trophy, MessageSquare, FileText, StopCircle, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LiveSimulationChat from "@/components/LiveSimulationChat";

interface SimulationTrainingProps {
  projectId: string;
  disabled?: boolean;
  onComplete?: () => void;
}

interface RecommendedImprovement {
  field: string;
  suggested_value: string;
  reason: string;
  severity: "critical" | "important" | "minor";
}

interface CallResult {
  call_id?: string;
  transcript?: string;
  evaluation?: {
    overall_score?: number;
    humanness_score?: number;
    naturalness_score?: number;
    issues_detected?: string[];
    recommended_improvements?: RecommendedImprovement[];
  };
  difficulty?: string;
}

interface RoundResult {
  round: number;
  status: string;
  avg_score: number | null;
  previous_score: number | null;
  calls: CallResult[];
  fixesApplied?: number;
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

export default function SimulationTraining({ projectId, disabled, onComplete }: SimulationTrainingProps) {
  const { toast } = useToast();

  const mode = "simulate";
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [activeTab, setActiveTab] = useState("training");
  const [maxRounds, setMaxRounds] = useState(3);
  const [callsPerRound, setCallsPerRound] = useState(3);

  const [running, setRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentCall, setCurrentCall] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);


  const cancelRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (roundResults.length > 0 && !running && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [running, roundResults]);

  const runSingleSimulation = useCallback(async (): Promise<CallResult> => {
    const { data, error } = await supabase.functions.invoke("simulate-call", {
      body: { project_id: projectId, customer_difficulty: difficulty, max_turns: 12 },
    });
    if (error) {
      const msg = await extractEdgeFunctionError(error);
      throw new Error(msg);
    }
    return data as CallResult;
  }, [projectId, difficulty]);

  const handleStartTraining = async () => {
    setRunning(true);
    setRoundResults([]);
    setFinalScore(null);
    setExpandedRound(null);
    cancelRef.current = false;

    let previousScore: number | null = null;

    try {
      toast({ title: "Training started", description: `Running up to ${maxRounds} rounds × ${callsPerRound} calls...` });

      for (let round = 1; round <= maxRounds; round++) {
        if (cancelRef.current) break;
        setCurrentRound(round);

        const calls: CallResult[] = [];
        let scoreSum = 0;
        let scoreCount = 0;

        for (let call = 1; call <= callsPerRound; call++) {
          if (cancelRef.current) break;
          setCurrentCall(call);

          try {
            const result = await runSingleSimulation();
            calls.push(result);
            if (result.evaluation?.overall_score != null) {
              scoreSum += result.evaluation.overall_score;
              scoreCount++;
            }
          } catch (err: any) {
            calls.push({ evaluation: undefined, difficulty: difficulty });
            toast({ title: `Round ${round}, Call ${call} failed`, description: err.message, variant: "destructive" });
          }
        }

        const avgScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null;

        // ── Apply critical/important recommendations ──
        let fixesApplied = 0;
        if (!cancelRef.current) {
          const allRecommendations: RecommendedImprovement[] = [];
          for (const call of calls) {
            const recs = call.evaluation?.recommended_improvements;
            if (recs) {
              for (const rec of recs) {
                if (rec.severity === "critical" || rec.severity === "important") {
                  allRecommendations.push(rec);
                }
              }
            }
          }

          // Deduplicate by field name (take the first recommendation per field)
          const seenFields = new Set<string>();
          const uniqueRecs = allRecommendations.filter(rec => {
            if (seenFields.has(rec.field)) return false;
            seenFields.add(rec.field);
            return true;
          });

          for (const rec of uniqueRecs) {
            if (cancelRef.current) break;
            try {
              const { data: applyResult } = await supabase.functions.invoke("apply-audit-recommendation", {
                body: {
                  project_id: projectId,
                  recommendation: `${rec.reason}. Set ${rec.field} to: ${rec.suggested_value}`,
                  category: rec.severity,
                },
              });
              if (applyResult?.success) fixesApplied++;
            } catch {
              // Non-critical — continue
            }
          }
        }

        const roundResult: RoundResult = {
          round,
          status: "completed",
          avg_score: avgScore,
          previous_score: previousScore,
          calls,
          fixesApplied,
        };

        setRoundResults(prev => [...prev, roundResult]);
        previousScore = avgScore;

        // Early exit if score >= 9.0
        if (avgScore != null && avgScore >= 9.0) {
          setFinalScore(avgScore);
          toast({ title: "Excellence reached!", description: `Score ${avgScore}/10 — stopping early.` });
          break;
        }

        if (round === maxRounds) {
          setFinalScore(avgScore);
        }
      }

      if (!cancelRef.current) {
        toast({ title: "Training complete!", description: finalScore ? `Final score: ${finalScore}/10` : "All rounds finished." });
        onComplete?.();
      }
    } catch (err: any) {
      toast({ title: "Training failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setCurrentCall(0);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    toast({ title: "Cancelling...", description: "Will stop after the current call finishes." });
  };


  const getScoreColor = (score: number | null) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 8) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreDelta = (current: number | null, previous: number | null) => {
    if (current == null || previous == null) return null;
    const delta = Math.round((current - previous) * 10) / 10;
    if (delta > 0) return { icon: <ArrowUp className="h-3 w-3" />, text: `+${delta}`, color: "text-green-400" };
    if (delta < 0) return { icon: <ArrowDown className="h-3 w-3" />, text: `${delta}`, color: "text-red-400" };
    return { icon: <Minus className="h-3 w-3" />, text: "0", color: "text-muted-foreground" };
  };

  const totalCalls = maxRounds * callsPerRound;
  const completedCalls = ((currentRound - 1) * callsPerRound) + currentCall;
  const progressPct = running ? Math.min((completedCalls / totalCalls) * 100, 100) : 0;

  const isDisabled = disabled || running;

  return (
    <div className="space-y-4">
      {/* Header + Tabs */}
      <div className="gradient-border glass-card rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AI Simulation Training</h2>
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" /> No Phone Needed
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Your agent practices against AI customers. Use Training for scored rounds or Live Practice to watch in real-time.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Customer Difficulty</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as any)} disabled={isDisabled}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy — Cooperative</SelectItem>
              <SelectItem value="medium">Medium — Realistic</SelectItem>
              <SelectItem value="hard">Hard — Challenging</SelectItem>
              <SelectItem value="mixed">Mixed — Rotates</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-muted/50 p-1 rounded-lg">
            <TabsTrigger value="training" className="flex-1 gap-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" disabled={running || singleRunning}>
              <Trophy className="h-3.5 w-3.5" /> Training
            </TabsTrigger>
            <TabsTrigger value="live" className="flex-1 gap-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" disabled={running || singleRunning}>
              <Eye className="h-3.5 w-3.5" /> Live Practice
            </TabsTrigger>
          </TabsList>

          <TabsContent value="training" className="space-y-4 mt-4">

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Rounds</Label>
                  <span className="text-xs font-medium text-muted-foreground">{maxRounds}</span>
                </div>
                <Slider value={[maxRounds]} onValueChange={([v]) => setMaxRounds(v)} min={1} max={10} step={1} disabled={isDisabled} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Calls per Round</Label>
                  <span className="text-xs font-medium text-muted-foreground">{callsPerRound}</span>
                </div>
                <Slider value={[callsPerRound]} onValueChange={([v]) => setCallsPerRound(v)} min={1} max={10} step={1} disabled={isDisabled} />
              </div>
            </div>

            <div className="flex gap-2">
              {running ? (
                <Button variant="destructive" onClick={handleCancel} className="flex-1">
                  <StopCircle className="mr-2 h-4 w-4" /> Cancel Training
                </Button>
              ) : (
                <Button onClick={handleStartTraining} disabled={isDisabled || !projectId} className="flex-1">
                  <BrainCircuit className="mr-2 h-4 w-4" /> Start {maxRounds}-Round Training
                </Button>
              )}
              <Button variant="outline" onClick={handleSingleSimulation} disabled={isDisabled || !projectId} className="shrink-0">
                {singleRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <><MessageSquare className="mr-2 h-4 w-4" /> Test 1 Call</>}
              </Button>
            </div>

            {running && (
              <div className="space-y-2">
                <Progress value={progressPct} className={`h-2 ${running ? "shimmer-bar" : ""}`} />
                <p className="text-xs text-muted-foreground animate-pulse">
                  Round {currentRound}/{maxRounds} — Call {currentCall}/{callsPerRound}...
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="live" className="mt-4">
            <LiveSimulationChat projectId={projectId} difficulty={difficulty} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Single simulation result */}
      {singleResult && (
        <SingleResultCard result={singleResult} getScoreColor={getScoreColor} />
      )}

      {/* Training results */}
      {roundResults.length > 0 && (
        <div ref={resultRef} className="gradient-border glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Training Results</span>
            </div>
            {finalScore != null && (
              <Badge variant="outline" className={`text-xs ${finalScore >= 8 ? "border-green-500/30 text-green-400" : finalScore >= 6 ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400"}`}>
                Final: {finalScore}/10
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {roundResults.map((round) => {
              const delta = getScoreDelta(round.avg_score, round.previous_score);
              const isExpanded = expandedRound === round.round;
              return (
                <div key={round.round} className="rounded-lg border border-border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedRound(isExpanded ? null : round.round)}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-foreground">Round {round.round}</span>
                      <Badge variant="outline" className="text-xs">{round.calls.length} calls</Badge>
                      {round.fixesApplied != null && round.fixesApplied > 0 && (
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          <Zap className="h-3 w-3 mr-0.5" /> {round.fixesApplied} fix{round.fixesApplied > 1 ? "es" : ""} applied
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {round.avg_score != null && (
                        <span className={`text-sm font-semibold ${getScoreColor(round.avg_score)}`}>{round.avg_score}</span>
                      )}
                      {delta && (
                        <span className={`flex items-center gap-0.5 text-xs ${delta.color}`}>{delta.icon} {delta.text}</span>
                      )}
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/20 text-xs">
                      {round.calls.map((call, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-muted-foreground">Call {i + 1}</span>
                          <span className={getScoreColor(call.evaluation?.overall_score ?? null)}>
                            {call.evaluation?.overall_score != null ? `${call.evaluation.overall_score}/10` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!running && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Completed {roundResults.length} round{roundResults.length > 1 ? "s" : ""}.
                {(() => { const totalFixes = roundResults.reduce((s, r) => s + (r.fixesApplied || 0), 0); return totalFixes > 0 ? ` ${totalFixes} improvement${totalFixes > 1 ? "s" : ""} applied to agent spec.` : ""; })()}
                {finalScore != null && finalScore >= 9.0 && <span className="text-primary"> Agent reached excellence (9.0+)!</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SingleResultCard({ result, getScoreColor }: { result: CallResult; getScoreColor: (s: number | null) => string }) {
  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Single Simulation Result</span>
        {result.difficulty && <Badge variant="outline" className="text-xs">{result.difficulty}</Badge>}
      </div>

      {result.evaluation && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Overall", score: result.evaluation.overall_score },
            { label: "Humanness", score: result.evaluation.humanness_score },
            { label: "Naturalness", score: result.evaluation.naturalness_score },
          ].map(({ label, score }) => (
            <div key={label} className="text-center rounded-lg border border-border/50 bg-gradient-to-br from-muted/40 to-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${getScoreColor(score ?? null)}`}>{score ?? "—"}</p>
            </div>
          ))}
        </div>
      )}

      {result.evaluation?.issues_detected && result.evaluation.issues_detected.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Issues Detected:</p>
          <ul className="space-y-1">
            {result.evaluation.issues_detected.map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.transcript && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <FileText className="h-3 w-3" /> View Transcript <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 max-h-64 overflow-y-auto text-xs">
              {result.transcript.split("\n").map((line, i) => {
                const isAgent = line.startsWith("Agent:");
                const isUser = line.startsWith("User:");
                return (
                  <p key={i} className={isAgent ? "text-primary" : isUser ? "text-orange-400" : "text-muted-foreground"}>
                    {isAgent && <span className="font-semibold">Agent: </span>}
                    {isUser && <span className="font-semibold">Customer: </span>}
                    {line.replace(/^(Agent|User):\s*/, "")}
                  </p>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
