import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Play, Bot, BrainCircuit, ChevronDown, CheckCircle, XCircle,
  ArrowUp, ArrowDown, Minus, RotateCcw, Zap, Trophy, MessageSquare, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SimulationTrainingProps {
  projectId: string;
  disabled?: boolean;
  onComplete?: () => void;
}

interface RoundResult {
  round: number;
  mode: string;
  status: string;
  avg_score: number | null;
  previous_score: number | null;
  calls_evaluated?: number;
  fixes_applied?: number;
  fixes?: { field: string; reason: string; severity: string; action: string }[];
  rolled_back?: string;
}

interface SimulationResult {
  project_id: string;
  mode: string;
  rounds_completed: number;
  results: RoundResult[];
  final_score: number | null;
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

  const [mode, setMode] = useState<"simulate" | "live" | "hybrid">("simulate");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [maxRounds, setMaxRounds] = useState(3);
  const [callsPerRound, setCallsPerRound] = useState(3);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  const [singleResult, setSingleResult] = useState<{
    call_id: string;
    transcript: string;
    evaluation: any;
    difficulty: string;
  } | null>(null);
  const [singleRunning, setSingleRunning] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const handleStartTraining = async () => {
    setRunning(true);
    setResult(null);
    setCurrentRound(0);
    setExpandedRound(null);

    try {
      toast({ title: "Training started", description: `Running ${maxRounds} rounds of ${mode} training...` });

      const progressInterval = setInterval(() => {
        setCurrentRound((prev) => Math.min(prev + 1, maxRounds));
      }, 15000);

      const { data, error } = await supabase.functions.invoke("auto-train", {
        body: {
          project_id: projectId,
          mode,
          max_rounds: maxRounds,
          calls_per_round: callsPerRound,
          customer_difficulty: difficulty,
          auto_apply_severity: ["critical", "important"],
        },
      });

      clearInterval(progressInterval);

      if (error) {
        const msg = await extractEdgeFunctionError(error);
        throw new Error(msg);
      }

      setResult(data as SimulationResult);
      setCurrentRound(data.rounds_completed);
      toast({
        title: "Training complete!",
        description: data.final_score
          ? `Final score: ${data.final_score}/10 after ${data.rounds_completed} round(s)`
          : `Completed ${data.rounds_completed} round(s)`,
      });
      onComplete?.();
    } catch (err: any) {
      toast({ title: "Training failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleSingleSimulation = async () => {
    setSingleRunning(true);
    setSingleResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("simulate-call", {
        body: { project_id: projectId, customer_difficulty: difficulty, max_turns: 12 },
      });

      if (error) {
        const msg = await extractEdgeFunctionError(error);
        throw new Error(msg);
      }

      setSingleResult(data);
      toast({
        title: "Simulation complete",
        description: data.evaluation ? `Score: ${data.evaluation.overall_score}/10` : "Conversation generated",
      });
    } catch (err: any) {
      toast({ title: "Simulation failed", description: err.message, variant: "destructive" });
    } finally {
      setSingleRunning(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 8) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "regression_rollback":
        return <RotateCcw className="h-4 w-4 text-destructive" />;
      case "regression_detected_no_rollback":
        return <XCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  const getScoreDelta = (current: number | null, previous: number | null) => {
    if (current == null || previous == null) return null;
    const delta = Math.round((current - previous) * 10) / 10;
    if (delta > 0) return { icon: <ArrowUp className="h-3 w-3" />, text: `+${delta}`, color: "text-green-400" };
    if (delta < 0) return { icon: <ArrowDown className="h-3 w-3" />, text: `${delta}`, color: "text-red-400" };
    return { icon: <Minus className="h-3 w-3" />, text: "0", color: "text-muted-foreground" };
  };

  const isDisabled = disabled || running || singleRunning;

  return (
    <div className="space-y-4">
      {/* Header + Config */}
      <div className="surface-elevated rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AI Simulation Training</h2>
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" /> No Phone Needed
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Your agent practices against AI customers. The system evaluates each conversation,
            fixes issues, and repeats until it's ready for real calls.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Training Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)} disabled={isDisabled}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simulate">
                  <span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> Simulate Only</span>
                </SelectItem>
                <SelectItem value="hybrid">
                  <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Hybrid (Auto-Graduate)</span>
                </SelectItem>
                <SelectItem value="live">
                  <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5" /> Live Calls Only</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Customer Difficulty</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as any)} disabled={isDisabled}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy — Cooperative</SelectItem>
                <SelectItem value="medium">Medium — Realistic</SelectItem>
                <SelectItem value="hard">Hard — Challenging</SelectItem>
                <SelectItem value="mixed">Mixed — Rotates Each Round</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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

        {mode === "hybrid" && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <Zap className="h-3 w-3 inline mr-1" />
              Hybrid mode starts with AI simulations. When the score reaches 7.0+, it automatically switches to live calls for final testing.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleStartTraining} disabled={isDisabled || !projectId} className="flex-1">
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Training Round {currentRound}/{maxRounds}...</>
            ) : (
              <><BrainCircuit className="mr-2 h-4 w-4" /> Start {maxRounds}-Round Training</>
            )}
          </Button>
          <Button variant="outline" onClick={handleSingleSimulation} disabled={isDisabled || !projectId} className="shrink-0">
            {singleRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><MessageSquare className="mr-2 h-4 w-4" /> Test 1 Call</>
            )}
          </Button>
        </div>

        {running && (
          <div className="space-y-2">
            <Progress value={(currentRound / maxRounds) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground animate-pulse">
              Running {callsPerRound} simulated conversation{callsPerRound > 1 ? "s" : ""} per round...
            </p>
          </div>
        )}
      </div>

      {/* Single simulation result */}
      {singleResult && (
        <div className="surface-elevated rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Single Simulation Result</span>
            <Badge variant="outline" className="text-xs">{singleResult.difficulty}</Badge>
          </div>

          {singleResult.evaluation && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Overall", score: singleResult.evaluation.overall_score },
                { label: "Humanness", score: singleResult.evaluation.humanness_score },
                { label: "Naturalness", score: singleResult.evaluation.naturalness_score },
              ].map(({ label, score }) => (
                <div key={label} className="text-center rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${getScoreColor(score)}`}>{score ?? "—"}</p>
                </div>
              ))}
            </div>
          )}

          {singleResult.evaluation?.issues_detected?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Issues Detected:</p>
              <ul className="space-y-1">
                {singleResult.evaluation.issues_detected.map((issue: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <FileText className="h-3 w-3" /> View Conversation Transcript
              <ChevronDown className="h-3 w-3" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 max-h-64 overflow-y-auto text-xs">
                {singleResult.transcript.split("\n").map((line, i) => {
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
        </div>
      )}

      {/* Full training results */}
      {result && (
        <div ref={resultRef} className="surface-elevated rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Training Results</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{result.mode}</Badge>
              <Badge
                variant="outline"
                className={`text-xs ${
                  result.final_score && result.final_score >= 8
                    ? "border-green-500/30 text-green-400"
                    : result.final_score && result.final_score >= 6
                    ? "border-yellow-500/30 text-yellow-400"
                    : "border-red-500/30 text-red-400"
                }`}
              >
                Final: {result.final_score ?? "—"}/10
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            {result.results.map((round) => {
              const delta = getScoreDelta(round.avg_score, round.previous_score);
              const isExpanded = expandedRound === round.round;

              return (
                <div key={round.round} className="rounded-lg border border-border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedRound(isExpanded ? null : round.round)}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(round.status)}
                      <span className="font-medium text-foreground">Round {round.round}</span>
                      <Badge variant="outline" className="text-xs">{round.mode}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {round.avg_score != null && (
                        <span className={`text-sm font-semibold ${getScoreColor(round.avg_score)}`}>
                          {round.avg_score}
                        </span>
                      )}
                      {delta && (
                        <span className={`flex items-center gap-0.5 text-xs ${delta.color}`}>
                          {delta.icon} {delta.text}
                        </span>
                      )}
                      {round.fixes_applied != null && round.fixes_applied > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {round.fixes_applied} fix{round.fixes_applied > 1 ? "es" : ""}
                        </Badge>
                      )}
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/20 text-xs">
                      {round.status === "regression_rollback" && round.rolled_back && (
                        <div className="rounded-md bg-destructive/10 px-2 py-1.5">
                          <p className="flex items-center gap-1 text-destructive">
                            <RotateCcw className="h-3 w-3" />
                            Regression detected — rolled back: {round.rolled_back}
                          </p>
                        </div>
                      )}

                      {round.fixes && round.fixes.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">Fixes Applied:</p>
                          {round.fixes.map((fix, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                              <span>
                                <span className="font-medium text-foreground">{fix.field}</span>
                                {" — "}{fix.reason}
                                <Badge variant="outline" className="ml-1.5 text-[10px]">{fix.severity}</Badge>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-4 text-muted-foreground">
                        {round.calls_evaluated != null && <span>Calls evaluated: {round.calls_evaluated}</span>}
                        {round.avg_score != null && <span>Avg score: {round.avg_score}</span>}
                        {round.previous_score != null && <span>Previous: {round.previous_score}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Completed {result.rounds_completed} round{result.rounds_completed > 1 ? "s" : ""} with{" "}
              {result.results.reduce((sum, r) => sum + (r.fixes_applied || 0), 0)} total fixes applied.
              {result.final_score && result.final_score >= 9.0 && (
                <span className="text-green-400"> Agent reached excellence (9.0+)!</span>
              )}
              {result.results.some((r) => r.status === "regression_rollback") && (
                <span className="text-destructive"> Some changes were rolled back due to score regressions.</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
