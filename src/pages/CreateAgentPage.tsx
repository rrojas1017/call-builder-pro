import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Sparkles, ArrowRight, ArrowLeft, CheckCircle, Rocket, Eye, Pencil, FileText, Phone, Shield, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import TestLabSection from "@/components/TestLabSection";

const STEPS = ["Build Your Agent", "Clarify Details", "Review & Launch"];

interface WizardQuestion {
  question: string;
  rationale: string;
  answer: string;
  order_index: number;
}

export default function CreateAgentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [spec, setSpec] = useState<any>(null);
  const [showRawSpec, setShowRawSpec] = useState(false);
  const [rawSpecText, setRawSpecText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Campaign launch state (integrated into Step 3)
  const [campaignName, setCampaignName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [launching, setLaunching] = useState(false);

  // Step 1: Create project + generate spec
  const handleGenerateSpec = async () => {
    if (!user || !agentName.trim()) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile?.org_id) throw new Error("No organization found");

      let finalSourceText = sourceText || description;

      if (file) {
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("agent_sources").upload(filePath, file);
        if (uploadErr) throw uploadErr;
        finalSourceText += `\n[File uploaded: ${file.name}]`;
      }

      const { data: project, error: projErr } = await supabase.from("agent_projects").insert({
        org_id: profile.org_id,
        name: agentName,
        description,
        source_text: finalSourceText,
        created_by: user.id,
      }).select().single();
      if (projErr) throw projErr;
      setProjectId(project.id);
      setCampaignName(`${agentName} Campaign`);

      const { data, error } = await supabase.functions.invoke("generate-spec", {
        body: { project_id: project.id },
      });
      if (error) throw error;

      setQuestions(data.questions || []);
      setSpec(data.spec);
      setStep(1);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Save answers
  const handleSaveAnswers = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-wizard-answers", {
        body: { project_id: projectId, answers: questions },
      });
      if (error) throw error;
      setSpec(data.spec);
      setRawSpecText(JSON.stringify(data.spec, null, 2));
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Launch campaign
  const handleLaunch = async () => {
    if (!projectId || !campaignName.trim()) return;
    setLaunching(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();

      // Create campaign
      const { data: campaign, error: campErr } = await supabase.from("campaigns").insert({
        project_id: projectId,
        name: campaignName,
        max_concurrent_calls: maxConcurrent,
        status: "draft",
      }).select().single();
      if (campErr) throw campErr;

      // Parse CSV and insert contacts
      if (csvText.trim()) {
        const lines = csvText.trim().split("\n");
        const contacts = lines
          .map((line) => {
            const parts = line.split(",").map((s) => s.trim());
            if (parts.length >= 2) {
              return { campaign_id: campaign.id, name: parts[0], phone: parts[1], status: "queued" as const };
            }
            return null;
          })
          .filter(Boolean);

        if (contacts.length > 0) {
          const { error: cErr } = await supabase.from("contacts").insert(contacts as any[]);
          if (cErr) throw cErr;
        }
      }

      // Start campaign
      const { error: startErr } = await supabase.functions.invoke("start-campaign", {
        body: { campaign_id: campaign.id },
      });
      if (startErr) throw startErr;

      toast({ title: "Campaign launched!", description: `${campaignName} is now running.` });
      navigate("/campaigns");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  };

  const updateAnswer = (idx: number, answer: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, answer } : q)));
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:inline", i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Build Your AI Call Agent */}
      {step === 0 && (
        <div className="surface-elevated rounded-xl p-6 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Build Your AI Call Agent</h1>
            <p className="text-muted-foreground mt-1">Describe what you want the agent to do. We'll handle the structure.</p>
          </div>
          <div className="space-y-2">
            <Label>Agent Name</Label>
            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Health Insurance Pre-Qualifier" />
          </div>
          <div className="space-y-2">
            <Label>What should your agent do?</Label>
            <Textarea
              value={sourceText || description}
              onChange={(e) => { setSourceText(e.target.value); setDescription(e.target.value); }}
              placeholder="I need an AI agent that calls people who requested health insurance information, checks qualification, and transfers qualified individuals."
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Or upload a document (.txt, .docx, .pdf)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Choose file"}
              <input type="file" className="hidden" accept=".txt,.docx,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <Button onClick={handleGenerateSpec} disabled={loading || !agentName.trim()} className="w-full" size="lg">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate My Agent
          </Button>
        </div>
      )}

      {/* Step 2: Let's Make It Work Perfectly */}
      {step === 1 && (
        <div className="surface-elevated rounded-xl p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Let's Make It Work Perfectly</h1>
            <p className="text-muted-foreground mt-1">Answer a few quick questions so your agent performs correctly.</p>
          </div>
          {questions.map((q, i) => (
            <div key={i} className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <Label className="text-foreground font-medium">{q.question}</Label>
              {q.rationale && (
                <p className="text-xs text-muted-foreground italic flex items-start gap-1">
                  <Shield className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Why this matters: {q.rationale}</span>
                </p>
              )}
              <Textarea
                value={q.answer}
                onChange={(e) => updateAnswer(i, e.target.value)}
                rows={2}
                placeholder="Your answer..."
              />
            </div>
          ))}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSaveAnswers} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Confirm & Review
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review Your AI Agent */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review Your AI Agent</h1>
            <p className="text-muted-foreground mt-1">Here's exactly what your agent will do.</p>
          </div>

          {!showRawSpec && spec && (
            <div className="grid gap-4">
              <SummaryCard icon={<Users className="h-5 w-5" />} title="Who it calls" value={spec.mode === "inbound" ? "Handles incoming calls" : "Makes outbound calls to your contacts"} />
              <SummaryCard icon={<Phone className="h-5 w-5" />} title="What it says" value={spec.opening_line || "Standard greeting"} />
              <SummaryCard icon={<FileText className="h-5 w-5" />} title="What it collects" value={Array.isArray(spec.must_collect_fields) ? (spec.must_collect_fields as string[]).join(", ") : "Standard fields"} />
              <SummaryCard icon={<Shield className="h-5 w-5" />} title="Qualification logic" value={spec.qualification_rules ? JSON.stringify(spec.qualification_rules) : "No specific rules"} />
              <SummaryCard icon={<ArrowRight className="h-5 w-5" />} title="Transfer logic" value={spec.transfer_required ? `Transfers to ${spec.transfer_phone_number || "configured number"}` : "No live transfer"} />
              <SummaryCard icon={<Target className="h-5 w-5" />} title="Success definition" value={spec.success_definition || "Complete the call objectives"} />
              <SummaryCard icon={<Phone className="h-5 w-5" />} title="Voice" value={spec.voice_id || "maya (default)"} />
            </div>
          )}

          {showRawSpec && (
            <div className="surface-elevated rounded-xl p-4">
              <Textarea value={rawSpecText} onChange={(e) => setRawSpecText(e.target.value)} rows={14} className="font-mono text-xs" />
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowRawSpec(!showRawSpec)}>
            {showRawSpec ? <Eye className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
            {showRawSpec ? "View Summary" : "Edit Details"}
          </Button>

          {/* Test Lab */}
          {projectId && <TestLabSection projectId={projectId} />}

          {/* Integrated campaign launch */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Launch Campaign</h3>
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max Concurrent Calls</Label>
              <Input type="number" min={1} max={10} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Contacts (CSV: name, phone — one per line)</Label>
              <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={5} placeholder={"John Doe, +15551234567\nJane Smith, +15559876543"} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleLaunch} disabled={launching || !campaignName.trim() || !csvText.trim()} className="flex-1" size="lg">
              {launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Start Calls
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="surface-elevated rounded-lg p-4 flex items-start gap-3">
      <div className="text-primary mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="text-sm text-foreground mt-1">{value}</p>
      </div>
    </div>
  );
}
