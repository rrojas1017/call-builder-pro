import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Brain, Zap, CheckCircle2, AlertTriangle, XCircle, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CategoryResult {
  rating: number;
  findings: string[];
  recommendations: string[];
}

interface AuditResults {
  prompt_engineering: CategoryResult;
  evaluation_loop: CategoryResult;
  bland_config: CategoryResult;
  knowledge_pipeline: CategoryResult;
  feedback_loop: CategoryResult;
  missed_opportunities: CategoryResult;
}

interface AuditRecord {
  id: string;
  project_id: string;
  claude_results: AuditResults | null;
  gpt_results: AuditResults | null;
  merged_score: number | null;
  created_at: string;
}

interface AgentProject {
  id: string;
  name: string;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  prompt_engineering: { label: "Prompt Engineering", icon: <Brain className="h-4 w-4" /> },
  evaluation_loop: { label: "Evaluation Loop", icon: <CheckCircle2 className="h-4 w-4" /> },
  bland_config: { label: "Bland AI Config", icon: <Zap className="h-4 w-4" /> },
  knowledge_pipeline: { label: "Knowledge Pipeline", icon: <Brain className="h-4 w-4" /> },
  feedback_loop: { label: "Feedback Loop", icon: <History className="h-4 w-4" /> },
  missed_opportunities: { label: "Missed Opportunities", icon: <AlertTriangle className="h-4 w-4" /> },
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

function ratingColor(r: number): string {
  if (r >= 8) return "text-green-500";
  if (r >= 6) return "text-yellow-500";
  return "text-red-500";
}

function ratingBadgeVariant(r: number): "default" | "secondary" | "destructive" | "outline" {
  if (r >= 8) return "default";
  if (r >= 6) return "secondary";
  return "destructive";
}

function AgreementBadge({ claudeRating, gptRating }: { claudeRating?: number; gptRating?: number }) {
  if (claudeRating == null || gptRating == null) return null;
  const diff = Math.abs(claudeRating - gptRating);
  if (diff <= 1) {
    return <Badge variant="default" className="bg-green-600 text-xs">Both Agree</Badge>;
  }
  if (diff >= 3) {
    return <Badge variant="destructive" className="text-xs">Disagreement</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Slight Diff</Badge>;
}

export default function TrainingAuditPage() {
  const { activeOrgId: orgId } = useOrgContext();
  const { toast } = useToast();

  const [agents, setAgents] = useState<AgentProject[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [currentAudit, setCurrentAudit] = useState<AuditRecord | null>(null);
  const [pastAudits, setPastAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agents
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("agent_projects")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name");
      setAgents(data || []);
      setLoading(false);
    })();
  }, [orgId]);

  // Fetch past audits when agent changes
  useEffect(() => {
    if (!selectedAgent) {
      setPastAudits([]);
      setCurrentAudit(null);
      return;
    }
    (async () => {
      const { data } = await (supabase
        .from("training_audits") as any)
        .select("*")
        .eq("project_id", selectedAgent)
        .order("created_at", { ascending: false })
        .limit(10);
      const audits = (data || []) as AuditRecord[];
      setPastAudits(audits);
      if (audits.length > 0) setCurrentAudit(audits[0]);
      else setCurrentAudit(null);
    })();
  }, [selectedAgent]);

  const runAudit = async () => {
    if (!selectedAgent) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("audit-training-pipeline", {
        body: { project_id: selectedAgent },
      });
      if (error) throw error;
      const newAudit: AuditRecord = {
        id: data.id,
        project_id: selectedAgent,
        claude_results: data.claude_results,
        gpt_results: data.gpt_results,
        merged_score: data.merged_score,
        created_at: new Date().toISOString(),
      };
      setCurrentAudit(newAudit);
      setPastAudits((prev) => [newAudit, ...prev]);
      toast({ title: "Audit Complete", description: `Pipeline health score: ${data.merged_score}/10` });
    } catch (err: any) {
      console.error("Audit error:", err);
      toast({ title: "Audit Failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const selectedAgentName = useMemo(
    () => agents.find((a) => a.id === selectedAgent)?.name || "",
    [agents, selectedAgent]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training Pipeline Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dual-model review of your AI training loop using Claude & GPT-5.2
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runAudit} disabled={!selectedAgent || running}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Auditing…
              </>
            ) : (
              "Run Pipeline Audit"
            )}
          </Button>
        </div>
      </div>

      {/* Running state */}
      {running && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Running dual-model audit…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Claude Sonnet 4 and GPT-5.2 are independently reviewing {selectedAgentName}'s training pipeline.
              This may take 30-60 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!running && currentAudit && (
        <>
          {/* Health Score Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Pipeline Health Score</CardTitle>
                  <CardDescription>
                    {selectedAgentName} — {new Date(currentAudit.created_at).toLocaleString()}
                  </CardDescription>
                </div>
                <div className={`text-4xl font-bold ${ratingColor(currentAudit.merged_score || 0)}`}>
                  {currentAudit.merged_score ?? "–"}<span className="text-lg text-muted-foreground">/10</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {CATEGORIES.map((cat) => {
                  const cr = currentAudit.claude_results?.[cat as keyof AuditResults];
                  const gr = currentAudit.gpt_results?.[cat as keyof AuditResults];
                  const avg = cr && gr ? Math.round(((cr.rating + gr.rating) / 2) * 10) / 10 : (cr?.rating || gr?.rating || 0);
                  return (
                    <div key={cat} className="text-center p-3 rounded-lg border bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-1">{CATEGORY_LABELS[cat].label}</div>
                      <div className={`text-2xl font-bold ${ratingColor(avg)}`}>{avg}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Category Cards */}
          {CATEGORIES.map((cat) => {
            const claude = currentAudit.claude_results?.[cat as keyof AuditResults];
            const gpt = currentAudit.gpt_results?.[cat as keyof AuditResults];
            if (!claude && !gpt) return null;

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    {CATEGORY_LABELS[cat].icon}
                    <CardTitle className="text-base">{CATEGORY_LABELS[cat].label}</CardTitle>
                    <div className="ml-auto flex items-center gap-2">
                      <AgreementBadge claudeRating={claude?.rating} gptRating={gpt?.rating} />
                      {claude && (
                        <Badge variant={ratingBadgeVariant(claude.rating)} className="text-xs">
                          Claude: {claude.rating}/10
                        </Badge>
                      )}
                      {gpt && (
                        <Badge variant={ratingBadgeVariant(gpt.rating)} className="text-xs">
                          GPT-5.2: {gpt.rating}/10
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Claude Column */}
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Brain className="h-3 w-3" /> Claude Sonnet 4
                      </h4>
                      {claude ? (
                        <>
                          {claude.findings.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Findings</p>
                              <ul className="space-y-1">
                                {claude.findings.map((f, i) => (
                                  <li key={i} className="text-sm flex gap-2">
                                    <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {claude.recommendations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                              <ul className="space-y-1">
                                {claude.recommendations.map((r, i) => (
                                  <li key={i} className="text-sm flex gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No results</p>
                      )}
                    </div>

                    {/* GPT Column */}
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> GPT-5.2
                      </h4>
                      {gpt ? (
                        <>
                          {gpt.findings.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Findings</p>
                              <ul className="space-y-1">
                                {gpt.findings.map((f, i) => (
                                  <li key={i} className="text-sm flex gap-2">
                                    <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                                    <span>{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {gpt.recommendations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                              <ul className="space-y-1">
                                {gpt.recommendations.map((r, i) => (
                                  <li key={i} className="text-sm flex gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No results</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Past Audits */}
          {pastAudits.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audit History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pastAudits.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setCurrentAudit(a)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                        currentAudit?.id === a.id ? "border-primary bg-muted/30" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{new Date(a.created_at).toLocaleString()}</span>
                        <span className={`font-bold ${ratingColor(a.merged_score || 0)}`}>
                          {a.merged_score ?? "–"}/10
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty state */}
      {!running && !currentAudit && selectedAgent && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No audits yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run your first pipeline audit to get a dual-model review of {selectedAgentName}'s training loop.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedAgent && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">Select an agent to audit</p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose an agent from the dropdown above to begin.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
