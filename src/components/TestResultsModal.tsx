import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, Phone, Clock, ArrowLeft, FileText, Play, Wand2, GraduationCap, Download, Mic, MicOff, MessageSquarePlus, Pencil, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadRecordingMp3 } from "@/lib/recordingDownload";

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
}

interface TestResultsModalProps {
  testRunId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

const normalizeField = (field: string) =>
  field.replace(/\s*\(.*\)\s*$/, "").replace(/\//g, ".").trim();

const improvementKey = (imp: any) =>
  normalizeField(imp.field) + "::" + JSON.stringify(imp.suggested_value);

export default function TestResultsModal({ testRunId, projectId, open, onClose }: TestResultsModalProps) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<TestContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);
  const [applyingAll, setApplyingAll] = useState(false);

  // Fetch already-applied improvements from DB
  useEffect(() => {
    if (!open || !projectId) return;
    const fetchApplied = async () => {
      const { data } = await supabase
        .from("improvements")
        .select("patch, source_recommendation")
        .eq("project_id", projectId);
      if (data) {
        const keys: string[] = data.flatMap((row: any) => {
          const patchKeys = row.patch
            ? Object.keys(row.patch)
                .filter((k: string) => k !== "version")
                .map((k: string) => k + "::" + JSON.stringify(row.patch[k]))
            : [];
          // Also include source_recommendation so audit-applied fixes show as applied here too
          if (row.source_recommendation) {
            patchKeys.push(row.source_recommendation);
          }
          return patchKeys;
        });
        setAppliedFixes(keys);
      }
    };
    fetchApplied();
  }, [open, projectId]);

  const handleApplyFix = async (improvement: any) => {
    try {
      setApplyingFixId(improvement.field);
      const { data, error } = await supabase.functions.invoke("apply-improvement", {
        body: {
          project_id: projectId,
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
      toast({
        title: "Fix applied!",
        description: `Agent spec updated to version ${data.to_version}.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to apply fix",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setApplyingFixId(null);
    }
  };

  const handleApplyAllFixes = async (improvements: any[]) => {
    const unapplied = improvements.filter((imp: any) => !appliedFixes.includes(improvementKey(imp)));
    if (!unapplied.length) return;
    setApplyingAll(true);
    for (const imp of unapplied) {
      await handleApplyFix(imp);
    }
    setApplyingAll(false);
    toast({ title: "All fixes applied!", description: "Agent spec has been updated with all recommended improvements." });
  };

  // Poll for updates
  useEffect(() => {
    if (!open) return;

    const fetchContacts = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("*")
        .eq("test_run_id", testRunId)
        .order("created_at", { ascending: true });
      if (data) {
        setContacts(data as TestContact[]);
        setLoading(false);
      }
    };

    fetchContacts();

    const channel = supabase
      .channel(`test-run-${testRunId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_run_contacts",
          filter: `test_run_id=eq.${testRunId}`,
        },
        () => fetchContacts()
      )
      .subscribe();

    const interval = setInterval(fetchContacts, 5000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [testRunId, open]);

  const allDone = contacts.length > 0 && contacts.every((c) => !["queued", "calling"].includes(c.status));
  const completedCount = contacts.filter((c) => !["queued", "calling"].includes(c.status)).length;
  const selected = contacts.find((c) => c.id === selectedId);

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (status === "calling") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (status === "queued") return <Clock className="h-4 w-4 text-muted-foreground" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: "bg-green-500/10 text-green-400 border-green-500/20",
      calling: "bg-primary/10 text-primary border-primary/20",
      queued: "bg-muted text-muted-foreground border-border",
      failed: "bg-destructive/10 text-destructive border-destructive/20",
      no_answer: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      voicemail: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    };
    return (
      <Badge variant="outline" className={variants[status] || variants.failed}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Test Results
            {!allDone && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {completedCount}/{contacts.length} calls completed
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : selectedId && selected ? (
            <div className="space-y-4 p-1">
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to list
              </Button>

              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">{selected.name}</h4>
                <p className="text-xs text-muted-foreground font-mono">{selected.phone}</p>
                <div className="flex items-center gap-2">
                  {statusBadge(selected.status)}
                  {selected.duration_seconds && (
                    <span className="text-xs text-muted-foreground">{selected.duration_seconds}s</span>
                  )}
                </div>
              </div>

              {selected.recording_url && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Play className="h-3 w-3" /> Recording
                  </h5>
                  <audio controls className="w-full h-8" src={selected.recording_url}>
                    Your browser does not support the audio element.
                  </audio>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => downloadRecordingMp3(selected.recording_url!, `test-${selected.id}.mp3`)}
                  >
                    <Download className="mr-1 h-3 w-3" /> Download MP3
                  </Button>
                </div>
              )}

              {selected.error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {selected.error}
                </div>
              )}

              {selected.transcript && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Transcript
                  </h5>
                  <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                    {selected.transcript}
                  </div>
                </div>
              )}

              {selected.status === "completed" && !selected.evaluation && (
                <GradingProgress hasTranscript={!!selected.transcript} />
              )}

              {selected.evaluation && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-muted-foreground">Evaluation</h5>
                  <div className="grid grid-cols-5 gap-2">
                    <ScoreCard label="Humanness" score={selected.evaluation.humanness_score} />
                    <ScoreCard label="Compliance" score={selected.evaluation.compliance_score} />
                    <ScoreCard label="Objective" score={selected.evaluation.objective_score} />
                    <ScoreCard label="Naturalness" score={selected.evaluation.naturalness_score} />
                    <ScoreCard label="Overall" score={selected.evaluation.overall_score} />
                  </div>

                  {/* Voice Recommendation */}
                  {selected.evaluation.voice_recommendation && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                      <p className="text-xs font-medium text-primary flex items-center gap-1">🎙️ Voice Recommendation</p>
                      <p className="text-xs text-foreground">{selected.evaluation.voice_recommendation.reason}</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Current: <strong>{selected.evaluation.voice_recommendation.current_voice}</strong> ({selected.evaluation.voice_recommendation.current_avg_humanness})</span>
                        <span className="text-primary">→ <strong>{selected.evaluation.voice_recommendation.suggested_voice}</strong> ({selected.evaluation.voice_recommendation.suggested_avg_humanness})</span>
                      </div>
                    </div>
                  )}

                  {selected.evaluation.humanness_suggestions?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Learned Conversation Techniques</p>
                      <ul className="text-xs text-foreground space-y-1">
                        {selected.evaluation.humanness_suggestions.map((tip: string, i: number) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-primary shrink-0">💡</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.evaluation.research_sources?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        🔍 Research Sources
                      </p>
                      <ul className="text-xs text-foreground space-y-1">
                        {selected.evaluation.research_sources.map((url: string, i: number) => (
                          <li key={i}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline truncate block"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.evaluation.delivery_issues?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Delivery Issues</p>
                      <ul className="text-xs text-foreground space-y-1">
                        {selected.evaluation.delivery_issues.map((issue: string, i: number) => (
                          <li key={i} className="flex items-start gap-1">
                            <XCircle className="h-3 w-3 mt-0.5 text-yellow-400 shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.evaluation.knowledge_gaps?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">🧠 Knowledge Gaps Detected</p>
                      <ul className="text-xs text-foreground space-y-1">
                        {selected.evaluation.knowledge_gaps.map((gap: string, i: number) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-yellow-400 shrink-0">⚠️</span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.evaluation.issues_detected?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Issues</p>
                      <ul className="text-xs text-foreground space-y-1">
                        {selected.evaluation.issues_detected.map((issue: string, i: number) => (
                          <li key={i} className="flex items-start gap-1">
                            <XCircle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

              {selected.evaluation.verbal_training_feedback?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        🎓 Verbal Training Feedback
                      </p>
                      <ul className="text-xs text-foreground space-y-2">
                        {selected.evaluation.verbal_training_feedback.map((fb: any, i: number) => (
                          <li key={i} className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-medium">"{fb.instruction}"</p>
                                <p className="text-muted-foreground text-xs mt-1">
                                  → <span className="text-primary">{fb.target_field}</span>: {fb.suggested_change}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                                  fb.confidence === "high" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                                  fb.confidence === "medium" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
                                  "bg-muted text-muted-foreground border-border"
                                }`}>
                                  {fb.confidence}
                                </span>
                                {fb.auto_applied ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-green-400 font-medium">
                                    <CheckCircle className="h-3 w-3" /> Applied
                                  </span>
                                ) : (
                                  <Button
                                    onClick={() => handleApplyFix({
                                      field: fb.target_field,
                                      suggested_value: fb.suggested_change,
                                      reason: `[VERBAL-TRAINING] ${fb.instruction}`,
                                    })}
                                    disabled={applyingFixId === fb.target_field}
                                    size="sm"
                                    variant="default"
                                    className="h-6 text-[10px] px-2"
                                  >
                                    {applyingFixId === fb.target_field && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                    Apply
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.evaluation.recommended_improvements?.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Recommended Improvements</p>
                        {selected.evaluation.recommended_improvements.length > 1 && (
                          <Button
                            onClick={() => handleApplyAllFixes(selected.evaluation.recommended_improvements)}
                            disabled={applyingAll || selected.evaluation.recommended_improvements.every((imp: any) => appliedFixes.includes(improvementKey(imp)))}
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                          >
                            {applyingAll ? (
                              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Applying...</>
                            ) : (
                              <><Wand2 className="mr-1 h-3 w-3" /> Apply All Fixes</>
                            )}
                          </Button>
                        )}
                      </div>
                      <ul className="text-xs text-foreground space-y-2">
                        {[...selected.evaluation.recommended_improvements]
                          .sort((a: any, b: any) => {
                            const order: Record<string, number> = { critical: 0, important: 1, minor: 2 };
                            return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
                          })
                          .map((imp: any, i: number) => (
                          <li key={i} className="rounded-lg bg-muted/30 border border-border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{imp.field}</p>
                                  <SeverityBadge severity={imp.severity} />
                                </div>
                                <p className="text-muted-foreground text-xs mt-1">{imp.reason}</p>
                                <p className="mt-2">Suggested: <span className="text-primary">{typeof imp.suggested_value === 'object' ? JSON.stringify(imp.suggested_value) : imp.suggested_value}</span></p>
                              </div>
                              <Button
                                onClick={() => handleApplyFix(imp)}
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

              {/* User Feedback Section */}
              {selected.status === "completed" && (
                <UserFeedbackSection
                  contactId={selected.id}
                  existingFeedback={selected.user_feedback || null}
                  onFeedbackSaved={(feedback) => {
                    setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, user_feedback: feedback } : c));
                  }}
                />
              )}

              {selected.extracted_data && (
                <div className="space-y-1">
                  <h5 className="text-xs font-medium text-muted-foreground">Extracted Data</h5>
                  <pre className="rounded-lg bg-muted/30 border border-border p-3 text-xs font-mono overflow-auto">
                    {JSON.stringify(selected.extracted_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 p-1">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="w-full flex items-center gap-3 rounded-lg p-3 text-left hover:bg-muted/50 transition-colors border border-border"
                >
                  {statusIcon(c.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                   {c.status === "completed" && !c.evaluation && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    )}
                    {c.evaluation?.overall_score != null && (
                      <span className={`text-sm font-semibold ${c.evaluation.overall_score >= 70 ? "text-green-400" : c.evaluation.overall_score >= 40 ? "text-yellow-400" : "text-destructive"}`}>
                        {c.evaluation.overall_score}
                      </span>
                    )}
                    {statusBadge(c.status)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
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

function GradingProgress({ hasTranscript }: { hasTranscript: boolean }) {
  const steps = [
    { label: "Transcript received", done: hasTranscript },
    { label: "Evaluating performance", done: false, active: hasTranscript },
    { label: "Calculating scores", done: false, active: false },
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
