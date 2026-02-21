import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Play, Loader2, Users, FileText, SlidersHorizontal, ChevronDown, Plus, Trash2, StopCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LiveCallMonitor from "@/components/LiveCallMonitor";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TestResultsModal from "./TestResultsModal";

interface TestLabSectionProps {
  projectId: string;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const cleaned = digits.startsWith("+") ? digits : digits.replace(/\D/g, "");
  if (cleaned.startsWith("+") && cleaned.length >= 11 && cleaned.length <= 16) return cleaned;
  const justDigits = cleaned.replace(/\D/g, "");
  if (justDigits.length === 10) return `+1${justDigits}`;
  if (justDigits.length === 11 && justDigits.startsWith("1")) return `+${justDigits}`;
  if (justDigits.length >= 11 && justDigits.length <= 15) return `+${justDigits}`;
  return null;
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

export default function TestLabSection({ projectId }: TestLabSectionProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"manual" | "upload">("manual");
  const [manualText, setManualText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<{ name: string; phone: string }[]>([]);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [activeContacts, setActiveContacts] = useState<{ id: string; bland_call_id: string | null; retell_call_id: string | null }[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Voice tuning state
  const [tuningOpen, setTuningOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [interruptionThreshold, setInterruptionThreshold] = useState(100);
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [pronunciationGuide, setPronunciationGuide] = useState<{ word: string; pronunciation: string }[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newPronunciation, setNewPronunciation] = useState("");
  const [tuningLoaded, setTuningLoaded] = useState(false);

  // Load voice tuning from agent_specs on mount
  useEffect(() => {
    async function loadTuning() {
      const { data } = await supabase
        .from("agent_specs")
        .select("temperature, interruption_threshold, speaking_speed, pronunciation_guide")
        .eq("project_id", projectId)
        .single();
      if (data) {
        if (data.temperature != null) setTemperature(data.temperature);
        if (data.interruption_threshold != null) setInterruptionThreshold(data.interruption_threshold);
        if (data.speaking_speed != null) setSpeakingSpeed(data.speaking_speed);
        if (data.pronunciation_guide && Array.isArray(data.pronunciation_guide)) {
          setPronunciationGuide(data.pronunciation_guide as { word: string; pronunciation: string }[]);
        }
      }
      setTuningLoaded(true);
    }
    loadTuning();
  }, [projectId]);

  // Parse manual contacts on text change
  useEffect(() => {
    if (mode !== "manual" || !manualText.trim()) {
      if (mode === "manual") setParsedContacts([]);
      return;
    }
    const lines = manualText.trim().split("\n");
    const contacts: { name: string; phone: string }[] = [];
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const phone = normalizePhone(parts[1]);
        if (phone) contacts.push({ name: parts[0], phone });
      }
    }
    setParsedContacts(contacts.slice(0, 5));
  }, [manualText, mode]);

  const handleFileUpload = async (file: File) => {
    setUploadFile(file);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("parse-dial-list", {
        body: { file_content: text, file_type: "csv" },
      });
      if (error) throw error;
      setParsedContacts((data.contacts || []).slice(0, 5));
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
  };

  // Poll active contacts for bland_call_ids when running
  useEffect(() => {
    if (!running || !testRunId) return;
    const poll = async () => {
      const { data } = await supabase
        .from("test_run_contacts")
        .select("id, bland_call_id, retell_call_id, status")
        .eq("test_run_id", testRunId);
      if (data) {
        const active = data
          .filter((c: any) => ["queued", "calling"].includes(c.status))
          .map((c: any) => ({ id: c.id, bland_call_id: c.bland_call_id, retell_call_id: c.retell_call_id }));
        setActiveContacts(active);
        if (active.length === 0 && data.every((c: any) => !["queued", "calling"].includes(c.status))) {
          setRunning(false);
        }
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [running, testRunId]);

  const handleRunTest = async () => {
    if (!parsedContacts.length) return;
    setRunning(true);
    setActiveContacts([]);
    try {
      const { data: createData, error: createErr } = await supabase.functions.invoke("create-test-run", {
        body: {
          project_id: projectId,
          name: `Test Run ${new Date().toLocaleString()}`,
          max_calls: 5,
          concurrency: 1,
          contacts: parsedContacts,
        },
      });
      if (createErr) {
        const msg = await extractEdgeFunctionError(createErr);
        throw new Error(msg);
      }

      setTestRunId(createData.test_run_id);

      const { error: runErr } = await supabase.functions.invoke("run-test-run", {
        body: { test_run_id: createData.test_run_id },
      });
      if (runErr) {
        const msg = await extractEdgeFunctionError(runErr);
        throw new Error(msg);
      }

      setShowResults(true);
      toast({ title: "Test started", description: `${parsedContacts.length} call(s) initiated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      // Don't set running=false here; polling handles it
    }
  };

  const handleStopAll = async () => {
    const withCallId = activeContacts.filter((c) => c.bland_call_id || c.retell_call_id);
    if (!withCallId.length) {
      toast({ title: "No active calls", description: "No calls with active connections to stop.", variant: "destructive" });
      return;
    }
    setStopping(true);
    try {
      await Promise.all(
        withCallId.map((c) => {
          const activeCallId = c.retell_call_id || c.bland_call_id;
          const callProvider = c.retell_call_id ? "retell" : "bland";
          return supabase.functions.invoke("stop-call", {
            body: { call_id: activeCallId, contact_id: c.id, provider: callProvider },
          });
        })
      );
      setRunning(false);
      setActiveContacts([]);
      toast({ title: "Calls stopped", description: `${withCallId.length} call(s) ended.` });
    } catch (err: any) {
      toast({ title: "Failed to stop", description: err.message, variant: "destructive" });
    } finally {
      setStopping(false);
    }
  };

  const saveTuningField = async (field: string, value: any) => {
    await supabase.from("agent_specs").update({ [field]: value }).eq("project_id", projectId);
  };

  return (
    <div className="space-y-4">
      {/* Test calls section */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Test Your Agent
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Run up to 5 sample calls. You'll receive the test call on your phone to evaluate quality.
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as "manual" | "upload"); setParsedContacts([]); setUploadFile(null); }}>
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1 gap-1">
              <Users className="h-3.5 w-3.5" /> Manual Entry
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1 gap-1">
              <FileText className="h-3.5 w-3.5" /> Upload File
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Paste contacts (one per line: Name, Phone)</Label>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={4}
                placeholder={"John Doe, +15551234567\nJane Smith, +15559876543"}
                className="font-mono text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
              <Upload className="h-4 w-4" />
              {uploadFile ? uploadFile.name : "Choose CSV file"}
              <input
                type="file"
                className="hidden"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>
          </TabsContent>
        </Tabs>

        {parsedContacts.length > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{parsedContacts.length} contact(s) parsed (max 5)</p>
            {parsedContacts.map((c, i) => (
              <p key={i} className="text-xs text-foreground font-mono">{c.name} — {c.phone}</p>
            ))}
          </div>
        )}

        <Button
          onClick={handleRunTest}
          disabled={running || !parsedContacts.length}
          className="w-full"
        >
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Run {parsedContacts.length || 0} Test Call{parsedContacts.length !== 1 ? "s" : ""}
        </Button>

        {running && (
          <Button
            variant="destructive"
            className="w-full"
            disabled={stopping}
            onClick={handleStopAll}
          >
            {stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
            Stop All Calls
          </Button>
        )}

        {/* Live Call Monitor for active calls */}
        {running && activeContacts.filter(c => c.bland_call_id || c.retell_call_id).map((c) => (
          <LiveCallMonitor
            key={c.id}
            blandCallId={c.bland_call_id}
            retellCallId={c.retell_call_id}
            contactId={c.id}
            isActive={running}
          />
        ))}

        {showResults && testRunId && (
          <TestResultsModal
            testRunId={testRunId}
            projectId={projectId}
            open={showResults}
            onClose={() => setShowResults(false)}
          />
        )}
      </div>

      {/* Voice Tuning (collapsible) */}
      {tuningLoaded && (
        <Collapsible open={tuningOpen} onOpenChange={setTuningOpen}>
          <div className="surface-elevated rounded-xl">
            <CollapsibleTrigger className="w-full p-6 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Voice Tuning
              </h3>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${tuningOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-6 pb-6 space-y-5">
              <p className="text-xs text-muted-foreground">Adjust these after hearing test calls to dial in the right sound.</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-xs text-muted-foreground font-mono">{temperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([v]) => { setTemperature(v); saveTuningField("temperature", v); }}
                  min={0} max={1} step={0.1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Predictable</span><span>Natural / Varied</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Interruption Threshold</Label>
                  <span className="text-xs text-muted-foreground font-mono">{interruptionThreshold}ms</span>
                </div>
                <Slider
                  value={[interruptionThreshold]}
                  onValueChange={([v]) => { setInterruptionThreshold(v); saveTuningField("interruption_threshold", v); }}
                  min={50} max={300} step={10}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Quick response</span><span>Patient listener</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Speaking Speed</Label>
                  <span className="text-xs text-muted-foreground font-mono">{speakingSpeed.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[speakingSpeed]}
                  onValueChange={([v]) => { setSpeakingSpeed(v); saveTuningField("speaking_speed", v); }}
                  min={0.7} max={1.2} step={0.05}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Slower</span><span>Faster</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Pronunciation Guide</Label>
                <p className="text-xs text-muted-foreground">Add words your agent mispronounces with their correct phonetic spelling.</p>
                {pronunciationGuide.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Word</TableHead>
                        <TableHead>Pronunciation</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pronunciationGuide.map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{entry.word}</TableCell>
                          <TableCell className="font-mono text-sm">{entry.pronunciation}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => {
                              const updated = pronunciationGuide.filter((_, idx) => idx !== i);
                              setPronunciationGuide(updated);
                              saveTuningField("pronunciation_guide", updated);
                            }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="flex gap-2">
                  <Input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="Word (e.g. ACA)" className="flex-1" />
                  <Input value={newPronunciation} onChange={(e) => setNewPronunciation(e.target.value)} placeholder="Say as (e.g. A-C-A)" className="flex-1" />
                  <Button variant="outline" size="sm" disabled={!newWord.trim() || !newPronunciation.trim()} onClick={() => {
                    const updated = [...pronunciationGuide, { word: newWord.trim(), pronunciation: newPronunciation.trim() }];
                    setPronunciationGuide(updated);
                    setNewWord("");
                    setNewPronunciation("");
                    saveTuningField("pronunciation_guide", updated);
                  }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
