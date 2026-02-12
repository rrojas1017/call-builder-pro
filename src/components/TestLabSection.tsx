import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Play, Loader2, Users, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

export default function TestLabSection({ projectId }: TestLabSectionProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"manual" | "upload">("manual");
  const [manualText, setManualText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<{ name: string; phone: string }[]>([]);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showResults, setShowResults] = useState(false);

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

  const handleRunTest = async () => {
    if (!parsedContacts.length) return;
    setRunning(true);
    try {
      // Create test run
      const { data: createData, error: createErr } = await supabase.functions.invoke("create-test-run", {
        body: {
          project_id: projectId,
          name: `Test Run ${new Date().toLocaleString()}`,
          max_calls: 5,
          concurrency: 1,
          contacts: parsedContacts,
        },
      });
      if (createErr) throw createErr;

      setTestRunId(createData.test_run_id);

      // Start test run
      const { error: runErr } = await supabase.functions.invoke("run-test-run", {
        body: { test_run_id: createData.test_run_id },
      });
      if (runErr) throw runErr;

      setShowResults(true);
      toast({ title: "Test started", description: `${parsedContacts.length} call(s) initiated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="surface-elevated rounded-xl p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Test Your Agent
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Run up to 5 sample calls before launching your campaign.</p>
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

      {showResults && testRunId && (
        <TestResultsModal
          testRunId={testRunId}
          open={showResults}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
