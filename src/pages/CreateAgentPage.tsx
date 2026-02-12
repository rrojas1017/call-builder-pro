import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Sparkles, ArrowRight, ArrowLeft, CheckCircle, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Describe Agent", "Screening Logic", "Review & Launch"];

interface WizardQuestion {
  question: string;
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
  const [specPreview, setSpecPreview] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  // Step 1: Create project + generate spec
  const handleGenerateSpec = async () => {
    if (!user || !agentName.trim()) return;
    setLoading(true);
    try {
      // Get profile for org_id
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile?.org_id) throw new Error("No organization found");

      let finalSourceText = sourceText;

      // Handle file upload
      if (file) {
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("agent_sources").upload(filePath, file);
        if (uploadErr) throw uploadErr;
        // For MVP, we'll extract text from the file on the server side
        // For now, just note the file was uploaded
        finalSourceText = sourceText + `\n[File uploaded: ${file.name}]`;
      }

      // Create project
      const { data: project, error: projErr } = await supabase.from("agent_projects").insert({
        org_id: profile.org_id,
        name: agentName,
        description,
        source_text: finalSourceText,
        created_by: user.id,
      }).select().single();
      if (projErr) throw projErr;
      setProjectId(project.id);

      // Call generate-spec edge function
      const { data, error } = await supabase.functions.invoke("generate-spec", {
        body: { project_id: project.id },
      });
      if (error) throw error;

      setQuestions(data.questions || []);
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
      setSpecPreview(JSON.stringify(data.spec, null, 2));
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateAnswer = (idx: number, answer: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, answer } : q)));
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create Agent</h1>
        <p className="text-muted-foreground mt-1">Build your AI phone agent in 3 simple steps.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                i <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:inline", i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Describe */}
      {step === 0 && (
        <div className="surface-elevated rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label>Agent Name</Label>
            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="ACA Pre-Qualifier" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pre-qualifies leads for ACA marketplace plans" />
          </div>
          <div className="space-y-2">
            <Label>Agent Prompt / Instructions</Label>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Describe what your agent should do. For example: 'Call leads, confirm they requested ACA info, collect demographics, and transfer qualified leads to a licensed agent.'"
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Or upload a document (.txt, .docx, .pdf)</Label>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                <Upload className="h-4 w-4" />
                {file ? file.name : "Choose file"}
                <input
                  type="file"
                  className="hidden"
                  accept=".txt,.docx,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
          <Button onClick={handleGenerateSpec} disabled={loading || !agentName.trim()} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Spec
          </Button>
        </div>
      )}

      {/* Step 2: Screening Logic */}
      {step === 1 && (
        <div className="surface-elevated rounded-xl p-6 space-y-5">
          <p className="text-sm text-muted-foreground">Answer these questions to configure your agent's behavior.</p>
          {questions.map((q, i) => (
            <div key={i} className="space-y-2">
              <Label className="text-foreground">{q.question}</Label>
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

      {/* Step 3: Review & Launch */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Agent Spec (editable)</h3>
            <Textarea
              value={specPreview}
              onChange={(e) => setSpecPreview(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => navigate(`/campaigns?project=${projectId}`)} className="flex-1">
              <Rocket className="mr-2 h-4 w-4" /> Create Campaign
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
