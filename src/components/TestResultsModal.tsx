import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, Phone, Clock, ArrowLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface TestResultsModalProps {
  testRunId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export default function TestResultsModal({ testRunId, projectId, open, onClose }: TestResultsModalProps) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<TestContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);

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
          },
        },
      });
      if (error) throw error;
      setAppliedFixes((prev) => [...prev, improvement.field]);
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

    // Subscribe to realtime changes
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

    // Also poll every 5s as backup
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

              {selected.evaluation && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-muted-foreground">Evaluation</h5>
                  <div className="grid grid-cols-3 gap-2">
                    <ScoreCard label="Compliance" score={selected.evaluation.compliance_score} />
                    <ScoreCard label="Objective" score={selected.evaluation.objective_score} />
                    <ScoreCard label="Overall" score={selected.evaluation.overall_score} />
                  </div>

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

                  {selected.evaluation.recommended_improvements?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Recommended Improvements</p>
                      <ul className="text-xs text-foreground space-y-2">
                        {selected.evaluation.recommended_improvements.map((imp: any, i: number) => (
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
