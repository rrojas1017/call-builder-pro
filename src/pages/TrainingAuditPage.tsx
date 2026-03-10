import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Brain, Zap, CheckCircle2, AlertTriangle, XCircle, History, Sparkles, ArrowRight, Play, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──

interface CategoryResult {
  rating: number;
  findings: string[];
  recommendations: string[];
}

interface UnifiedFinding {
  text: string;
  source: "both" | "claude" | "gpt";
  priority: "critical" | "important" | "minor";
}

interface UnifiedRecommendation {
  text: string;
  source: "both" | "claude" | "gpt";
  priority: "critical" | "important" | "minor";
  cross_agent_note?: string;
}

interface UnifiedCategoryResult {
  rating: number;
  findings: UnifiedFinding[];
  recommendations: UnifiedRecommendation[];
}

interface AuditResults {
  prompt_engineering: CategoryResult;
  evaluation_loop: CategoryResult;
  voice_config: CategoryResult;
  knowledge_pipeline: CategoryResult;
  feedback_loop: CategoryResult;
  missed_opportunities: CategoryResult;
}

interface UnifiedAuditResults {
  prompt_engineering: UnifiedCategoryResult;
  evaluation_loop: UnifiedCategoryResult;
  voice_config: UnifiedCategoryResult;
  knowledge_pipeline: UnifiedCategoryResult;
  feedback_loop: UnifiedCategoryResult;
  missed_opportunities: UnifiedCategoryResult;
}

interface CrossAgentFix {
  agent_name: string;
  change_summary: string;
  created_at: string;
}

interface AuditRecord {
  id: string;
  project_id: string;
  claude_results: AuditResults | null;
  gpt_results: AuditResults | null;
  unified_results: UnifiedAuditResults | null;
  cross_agent_context: CrossAgentFix[] | null;
  merged_score: number | null;
  created_at: string;
}

interface AgentProject {
  id: string;
  name: string;
}

// ── Constants ──

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  prompt_engineering: { label: "Prompt Engineering", icon: <Brain className="h-4 w-4" /> },
  evaluation_loop: { label: "Evaluation Loop", icon: <CheckCircle2 className="h-4 w-4" /> },
  voice_config: { label: "Voice AI Config", icon: <Zap className="h-4 w-4" /> },
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

function SourceBadge({ source }: { source: "both" | "claude" | "gpt" }) {
  if (source === "both") return <Badge variant="default" className="text-[10px] px-1.5 py-0">Both</Badge>;
  if (source === "claude") return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-400 text-purple-400">Claude</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-400">GPT</Badge>;
}

function PriorityIcon({ priority }: { priority: "critical" | "important" | "minor" }) {
  if (priority === "critical") return <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />;
  if (priority === "important") return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />;
}

// ── Legacy side-by-side for old audits ──

function LegacyCategoryCard({ cat, claude, gpt }: { cat: string; claude?: CategoryResult; gpt?: CategoryResult }) {
  if (!claude && !gpt) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {CATEGORY_LABELS[cat].icon}
          <CardTitle className="text-base">{CATEGORY_LABELS[cat].label}</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            {claude && <Badge variant={ratingBadgeVariant(claude.rating)} className="text-xs">Claude: {claude.rating}/10</Badge>}
            {gpt && <Badge variant={ratingBadgeVariant(gpt.rating)} className="text-xs">GPT: {gpt.rating}/10</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Claude Sonnet 4</h4>
            {claude ? (
              <>
                {claude.findings.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Findings</p>
                    <ul className="space-y-1">{claude.findings.map((f, i) => <li key={i} className="text-sm flex gap-2"><XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" /><span>{f}</span></li>)}</ul>
                  </div>
                )}
                {claude.recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                    <ul className="space-y-1">{claude.recommendations.map((r, i) => <li key={i} className="text-sm flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" /><span>{r}</span></li>)}</ul>
                  </div>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground italic">No results</p>}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">GPT-5.2</h4>
            {gpt ? (
              <>
                {gpt.findings.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Findings</p>
                    <ul className="space-y-1">{gpt.findings.map((f, i) => <li key={i} className="text-sm flex gap-2"><XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" /><span>{f}</span></li>)}</ul>
                  </div>
                )}
                {gpt.recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                    <ul className="space-y-1">{gpt.recommendations.map((r, i) => <li key={i} className="text-sm flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" /><span>{r}</span></li>)}</ul>
                  </div>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground italic">No results</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Apply button for a single recommendation ──

function ApplyButton({
  projectId,
  recommendation,
  category,
  applied,
  syncedToRetell,
  onApplied,
}: {
  projectId: string;
  recommendation: string;
  category: string;
  applied: boolean;
  syncedToRetell: boolean;
  onApplied: (rec: string, result: { success: boolean; manual?: boolean; note?: string; reason?: string; action?: string; synced_to_retell?: boolean }) => void;
}) {
  const [applying, setApplying] = useState(false);
  const { toast } = useToast();

  if (applied) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="default" className="bg-green-600 text-white text-[10px] px-2 py-0.5">
          <Check className="h-3 w-3 mr-1" />Applied
        </Badge>
        {syncedToRetell && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-green-500 text-green-600 bg-green-500/10">
            <Zap className="h-3 w-3 mr-0.5" />Synced to live agent
          </Badge>
        )}
      </div>
    );
  }

  const handleApply = async () => {
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-audit-recommendation", {
        body: { project_id: projectId, recommendation, category },
      });
      if (error) throw error;

      if (data.success) {
        onApplied(recommendation, data);
        toast({
          title: data.action === "add_knowledge" ? "Knowledge Added" : data.synced_to_retell ? "Spec Updated & Synced" : "Spec Updated",
          description: data.synced_to_retell
            ? `✅ Synced to live agent — ${data.reason || recommendation.slice(0, 60)}…`
            : data.reason || `Applied: ${recommendation.slice(0, 60)}…`,
        });
      } else if (data.manual) {
        onApplied(recommendation, { success: false, manual: true, note: data.note });
        toast({
          title: "Manual Review Needed",
          description: data.note || "This recommendation requires manual intervention",
          variant: "destructive",
        });
      } else if (data.skipped) {
        toast({
          title: "Skipped",
          description: data.reason || "Domain mismatch",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Apply error:", err);
      toast({ title: "Apply Failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleApply} disabled={applying} className="h-7 text-xs px-2 shrink-0">
      {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
      <span className="ml-1">{applying ? "Applying…" : "Apply"}</span>
    </Button>
  );
}

// ── Unified category card with Apply buttons ──

function UnifiedCategoryCard({
  cat,
  data,
  projectId,
  appliedSet,
  manualSet,
  onApplied,
}: {
  cat: string;
  data: UnifiedCategoryResult;
  projectId: string;
  appliedSet: Set<string>;
  manualSet: Set<string>;
  onApplied: (rec: string, result: any) => void;
}) {
  const sortedFindings = [...data.findings].sort((a, b) => {
    const order = { critical: 0, important: 1, minor: 2 };
    return order[a.priority] - order[b.priority];
  });
  const sortedRecs = [...data.recommendations].sort((a, b) => {
    const order = { critical: 0, important: 1, minor: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {CATEGORY_LABELS[cat].icon}
          <CardTitle className="text-base">{CATEGORY_LABELS[cat].label}</CardTitle>
          <div className="ml-auto">
            <Badge variant={ratingBadgeVariant(data.rating)} className="text-sm px-3">
              {data.rating}/10
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Findings */}
        {sortedFindings.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Findings</p>
            <ul className="space-y-2">
              {sortedFindings.map((f, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <PriorityIcon priority={f.priority} />
                  <span className="flex-1">{f.text}</span>
                  <SourceBadge source={f.source} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {sortedRecs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Recommendations</p>
            <ul className="space-y-2">
              {sortedRecs.map((r, i) => (
                <li key={i} className="text-sm space-y-1">
                  <div className="flex items-start gap-2">
                    <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span className="flex-1">{r.text}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge
                        variant={r.priority === "critical" ? "destructive" : r.priority === "important" ? "secondary" : "outline"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {r.priority}
                      </Badge>
                      <SourceBadge source={r.source} />
                      {manualSet.has(r.text) ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500 text-yellow-500 shrink-0">
                          <AlertCircle className="h-3 w-3 mr-0.5" />Manual
                        </Badge>
                      ) : (
                        <ApplyButton
                          projectId={projectId}
                          recommendation={r.text}
                          category={cat}
                          applied={appliedSet.has(r.text)}
                          onApplied={onApplied}
                        />
                      )}
                    </div>
                  </div>
                  {r.cross_agent_note && (
                    <div className="ml-5 flex items-center gap-1.5 text-xs text-primary bg-primary/5 rounded-md px-2 py-1">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>{r.cross_agent_note}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ──

export default function TrainingAuditPage() {
  const { activeOrgId: orgId } = useOrgContext();
  const { toast } = useToast();

  const [agents, setAgents] = useState<AgentProject[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [currentAudit, setCurrentAudit] = useState<AuditRecord | null>(null);
  const [pastAudits, setPastAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedRecs, setAppliedRecs] = useState<Set<string>>(new Set());
  const [manualRecs, setManualRecs] = useState<Set<string>>(new Set());
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyAllProgress, setApplyAllProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase.from("agent_projects").select("id, name").eq("org_id", orgId).order("name");
      setAgents(data || []);
      setLoading(false);
    })();
  }, [orgId]);

  useEffect(() => {
    if (!selectedAgent) { setPastAudits([]); setCurrentAudit(null); return; }
    (async () => {
      // Fetch audits and applied recommendations in parallel
      const [auditsRes, appliedRes] = await Promise.all([
        (supabase.from("training_audits") as any)
          .select("*")
          .eq("project_id", selectedAgent)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("improvements")
          .select("source_recommendation")
          .eq("project_id", selectedAgent)
          .not("source_recommendation", "is", null),
      ]);
      const audits = (auditsRes.data || []) as AuditRecord[];
      setPastAudits(audits);
      setCurrentAudit(audits.length > 0 ? audits[0] : null);

      // Load persisted applied state
      const appliedSet = new Set<string>();
      (appliedRes.data || []).forEach((row: any) => {
        if (row.source_recommendation) appliedSet.add(row.source_recommendation);
      });
      setAppliedRecs(appliedSet);
      setManualRecs(new Set());
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
        unified_results: data.unified_results,
        cross_agent_context: data.cross_agent_context,
        merged_score: data.merged_score,
        created_at: new Date().toISOString(),
      };
      setCurrentAudit(newAudit);
      setPastAudits((prev) => [newAudit, ...prev]);
      // Keep appliedRecs from DB — don't reset, previously applied recs stay applied
      setManualRecs(new Set());
      toast({ title: "Audit Complete", description: `Pipeline health score: ${data.merged_score}/10` });
    } catch (err: any) {
      console.error("Audit error:", err);
      toast({ title: "Audit Failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleApplied = (rec: string, result: any) => {
    if (result.success) {
      setAppliedRecs((prev) => new Set(prev).add(rec));
    } else if (result.manual) {
      setManualRecs((prev) => new Set(prev).add(rec));
    }
  };

  // Collect all actionable recommendations
  const allActionableRecs = useMemo(() => {
    if (!currentAudit?.unified_results) return [];
    const recs: { text: string; category: string; priority: string }[] = [];
    for (const cat of CATEGORIES) {
      const data = currentAudit.unified_results[cat as keyof UnifiedAuditResults];
      if (!data) continue;
      for (const r of data.recommendations) {
        if (r.priority === "critical" || r.priority === "important") {
          recs.push({ text: r.text, category: cat, priority: r.priority });
        }
      }
    }
    return recs;
  }, [currentAudit]);

  const unappliedRecs = allActionableRecs.filter(
    (r) => !appliedRecs.has(r.text) && !manualRecs.has(r.text)
  );

  const applyAll = async () => {
    if (!selectedAgent || unappliedRecs.length === 0) return;
    setApplyingAll(true);
    let applied = 0;
    let manual = 0;
    let failed = 0;

    for (let i = 0; i < unappliedRecs.length; i++) {
      const rec = unappliedRecs[i];
      setApplyAllProgress({ current: i + 1, total: unappliedRecs.length });
      try {
        const { data, error } = await supabase.functions.invoke("apply-audit-recommendation", {
          body: { project_id: selectedAgent, recommendation: rec.text, category: rec.category },
        });
        if (error) { failed++; continue; }
        if (data.success) {
          setAppliedRecs((prev) => new Set(prev).add(rec.text));
          applied++;
        } else if (data.manual) {
          setManualRecs((prev) => new Set(prev).add(rec.text));
          manual++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setApplyingAll(false);
    setApplyAllProgress(null);

    const parts: string[] = [];
    if (applied > 0) parts.push(`${applied} applied`);
    if (manual > 0) parts.push(`${manual} need manual review`);
    if (failed > 0) parts.push(`${failed} failed`);

    toast({
      title: "Apply All Complete",
      description: parts.join(", "),
      variant: failed > 0 ? "destructive" : "default",
    });
  };

  const selectedAgentName = useMemo(() => agents.find((a) => a.id === selectedAgent)?.name || "", [agents, selectedAgent]);
  const hasUnified = !!currentAudit?.unified_results;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training Pipeline Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified dual-model review with cross-agent learning
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={runAudit} disabled={!selectedAgent || running}>
            {running ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Auditing…</>) : "Run Pipeline Audit"}
          </Button>
        </div>
      </div>

      {/* Running state */}
      {running && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Running unified audit…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Claude &amp; GPT-5.2 are auditing independently, then results are merged into a single set of recommendations. This may take 45-90 seconds.
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
                    {hasUnified && <Badge variant="outline" className="ml-2 text-[10px]">Unified</Badge>}
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
                  const unified = currentAudit.unified_results?.[cat as keyof UnifiedAuditResults];
                  const cr = currentAudit.claude_results?.[cat as keyof AuditResults];
                  const gr = currentAudit.gpt_results?.[cat as keyof AuditResults];
                  const rating = unified?.rating ?? (cr && gr ? Math.round(((cr.rating + gr.rating) / 2) * 10) / 10 : (cr?.rating || gr?.rating || 0));
                  return (
                    <div key={cat} className="text-center p-3 rounded-lg border bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-1">{CATEGORY_LABELS[cat].label}</div>
                      <div className={`text-2xl font-bold ${ratingColor(rating)}`}>{rating}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Apply All button */}
          {hasUnified && unappliedRecs.length > 0 && (
            <div className="flex items-center gap-3">
              <Button onClick={applyAll} disabled={applyingAll} variant="default">
                {applyingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Applying {applyAllProgress?.current}/{applyAllProgress?.total}…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Apply All Critical & Important ({unappliedRecs.length})
                  </>
                )}
              </Button>
              {appliedRecs.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {appliedRecs.size} applied{manualRecs.size > 0 ? `, ${manualRecs.size} manual` : ""}
                </span>
              )}
            </div>
          )}

          {/* Cross-Agent Insights banner */}
          {currentAudit.cross_agent_context && currentAudit.cross_agent_context.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Cross-Agent Context
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">
                  {currentAudit.cross_agent_context.length} recent improvements from other agents in your org were considered during this audit.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(currentAudit.cross_agent_context.map((f) => f.agent_name))].map((name) => (
                    <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category Cards — unified or legacy */}
          {CATEGORIES.map((cat) => {
            if (hasUnified) {
              const data = currentAudit.unified_results![cat as keyof UnifiedAuditResults];
              if (!data) return null;
              return (
                <UnifiedCategoryCard
                  key={cat}
                  cat={cat}
                  data={data}
                  projectId={selectedAgent}
                  appliedSet={appliedRecs}
                  manualSet={manualRecs}
                  onApplied={handleApplied}
                />
              );
            }
            // Legacy fallback
            return (
              <LegacyCategoryCard
                key={cat}
                cat={cat}
                claude={currentAudit.claude_results?.[cat as keyof AuditResults]}
                gpt={currentAudit.gpt_results?.[cat as keyof AuditResults]}
              />
            );
          })}

          {/* Past Audits */}
          {pastAudits.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Audit History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pastAudits.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setCurrentAudit(a)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50 ${currentAudit?.id === a.id ? "border-primary bg-muted/30" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{new Date(a.created_at).toLocaleString()}</span>
                          {a.unified_results && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Unified</Badge>}
                        </div>
                        <span className={`font-bold ${ratingColor(a.merged_score || 0)}`}>{a.merged_score ?? "–"}/10</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty states */}
      {!running && !currentAudit && selectedAgent && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No audits yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run your first pipeline audit to get a unified review of {selectedAgentName}'s training loop.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedAgent && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">Select an agent to audit</p>
            <p className="text-sm text-muted-foreground mt-1">Choose an agent from the dropdown above to begin.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
