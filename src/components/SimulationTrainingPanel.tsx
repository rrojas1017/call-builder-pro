import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, CheckCircle, AlertTriangle, RotateCcw, TrendingUp, Brain,
} from "lucide-react";

interface RoundResult {
  round: number;
  mode: string;
  status: string;
  avg_score: number | null;
  previous_score: number | null;
  calls_evaluated?: number;
  fixes_applied?: number;
  fixes?: { field: string; reason: string; severity: string }[];
  rolled_back?: string;
}

interface TrainingResponse {
  project_id: string;
  mode: string;
  rounds_completed: number;
  results: RoundResult[];
  final_score: number | null;
}

interface Props {
  agentId: string;
  disabled?: boolean;
  onComplete?: () => void;
}

export default function SimulationTrainingPanel({ agentId, disabled, onComplete }: Props) {
  const { toast } = useToast();
  const [difficulty, setDifficulty] = useState("medium");
  const [rounds, setRounds] = useState(3);
  const [callsPerRound, setCallsPerRound] = useState(3);
  const [mode, setMode] = useState<"simulate" | "hybrid">("simulate");
  const [hybridThreshold, setHybridThreshold] = useState(7);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TrainingResponse | null>(null);

  const handleStart = async () => {
    setRunning(true);
    setResults(null);
    try {
      const body: Record<string, unknown> = {
        project_id: agentId,
        mode,
        max_rounds: rounds,
        calls_per_round: callsPerRound,
        customer_difficulty: difficulty,
      };
      if (mode === "hybrid") body.hybrid_live_threshold = hybridThreshold;

      const { data, error } = await supabase.functions.invoke("auto-train", { body });
      if (error) throw error;
      setResults(data as TrainingResponse);
      toast({ title: "Training complete", description: `${data.rounds_completed} round(s) finished. Final score: ${data.final_score ?? "—"}` });
      onComplete?.();
    } catch (err: any) {
      toast({ title: "Training failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === "regression_rollback") return <RotateCcw className="h-4 w-4 text-destructive" />;
    if (status === "regression_detected_no_rollback") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  };

  const scoreDelta = (r: RoundResult) => {
    if (r.avg_score == null || r.previous_score == null) return null;
    const d = Math.round((r.avg_score - r.previous_score) * 10) / 10;
    if (d > 0) return <span className="text-green-500 text-xs font-medium">+{d}</span>;
    if (d < 0) return <span className="text-destructive text-xs font-medium">{d}</span>;
    return <span className="text-muted-foreground text-xs">±0</span>;
  };

  return (
    <div className="surface-elevated rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">AI Simulation Training</h2>
        <Badge variant="secondary" className="text-xs">Beta</Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Run AI-vs-AI conversations to train your agent without making real calls.
      </p>

      {/* Config */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Difficulty</Label>
          <Select value={difficulty} onValueChange={setDifficulty} disabled={running || disabled}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "simulate" | "hybrid")} disabled={running || disabled}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simulate">Simulate Only</SelectItem>
              <SelectItem value="hybrid">Hybrid (→ Live)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Rounds: {rounds}</Label>
          <Slider
            value={[rounds]}
            onValueChange={([v]) => setRounds(v)}
            min={1} max={5} step={1}
            disabled={running || disabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Calls / round: {callsPerRound}</Label>
          <Slider
            value={[callsPerRound]}
            onValueChange={([v]) => setCallsPerRound(v)}
            min={1} max={5} step={1}
            disabled={running || disabled}
          />
        </div>

        {mode === "hybrid" && (
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Live threshold score</Label>
            <Input
              type="number"
              min={1} max={10} step={0.5}
              value={hybridThreshold}
              onChange={(e) => setHybridThreshold(Number(e.target.value))}
              disabled={running || disabled}
              className="h-9 text-sm w-32"
            />
          </div>
        )}
      </div>

      <Button onClick={handleStart} disabled={running || disabled || !agentId} className="w-full">
        {running ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Training… this may take a few minutes</>
        ) : (
          <><Zap className="mr-2 h-4 w-4" /> Start AI Training</>
        )}
      </Button>

      {/* Progress / Results */}
      {running && !results && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running {rounds} round(s) × {callsPerRound} call(s)…
        </div>
      )}

      {results && results.results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Results</span>
            {results.final_score != null && (
              <Badge className="gap-1">
                <TrendingUp className="h-3 w-3" /> Final: {results.final_score}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {results.results.map((r) => (
              <div key={r.round} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {statusIcon(r.status)}
                <span className="font-medium text-foreground">Round {r.round}</span>
                {r.avg_score != null && (
                  <span className="text-muted-foreground">Score: {r.avg_score}</span>
                )}
                {scoreDelta(r)}
                {r.fixes_applied != null && r.fixes_applied > 0 && (
                  <Badge variant="outline" className="text-xs ml-auto">{r.fixes_applied} fix{r.fixes_applied > 1 ? "es" : ""}</Badge>
                )}
                {r.status === "regression_rollback" && (
                  <Badge variant="destructive" className="text-xs ml-auto">Rolled back</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
