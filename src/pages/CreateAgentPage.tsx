import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Sparkles, ArrowRight, ArrowLeft, CheckCircle, Eye, Pencil, FileText, Phone, PhoneIncoming, PhoneForwarded, Shield, Target, Users, Mic, Save, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useBlandVoices } from "@/hooks/useBlandVoices";
import { VoiceSelector } from "@/components/VoiceSelector";

const STEPS = ["Build Your Agent", "Clarify Details", "Review & Save"];

const EXAMPLE_PROMPTS = [
  "Calls leads to verify insurance eligibility and transfer qualified ones",
  "Schedules appointments and sends confirmations",
  "Surveys customers after purchases for feedback",
  "Handles inbound support calls and escalates complex issues",
];

interface WizardQuestion {
  question: string;
  rationale: string;
  answer: string;
  suggested_default: string;
  order_index: number;
}

export default function CreateAgentPage() {
  const { voices: blandVoices, loading: voicesLoading } = useBlandVoices();
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
  const [selectedVoice, setSelectedVoice] = useState("maya");
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [backgroundTrack, setBackgroundTrack] = useState<string | null>("office");
  const [voiceProvider, setVoiceProvider] = useState<"bland" | "retell">("bland");
  const [retellAgentId, setRetellAgentId] = useState("");
  const [agentMode, setAgentMode] = useState<"outbound" | "inbound" | "hybrid">("outbound");

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

      const { data, error } = await supabase.functions.invoke("generate-spec", {
        body: { project_id: project.id },
      });
      if (error) throw error;

      setQuestions((data.questions || []).map((q: any) => ({
        ...q,
        suggested_default: q.answer || "",
        answer: "",
      })));
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
      setTransferEnabled(!!data.spec?.transfer_required);
      setTransferPhone(data.spec?.transfer_phone_number || "");
      setAgentMode(data.spec?.mode || "outbound");
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Save agent
  const handleSaveAgent = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const voiceId = selectedVoice === "custom" ? customVoiceId.trim() : selectedVoice;
      const phoneDigits = transferPhone.replace(/\D/g, "");
      if (transferEnabled && phoneDigits.length < 10) {
        toast({ title: "Invalid phone number", description: "Please enter at least 10 digits for the transfer number.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const formattedPhone = transferEnabled && phoneDigits.length >= 10
        ? (phoneDigits.startsWith("1") ? `+${phoneDigits}` : `+1${phoneDigits}`)
        : null;
      await supabase.from("agent_specs").update({
        voice_id: voiceId || undefined,
        transfer_required: transferEnabled,
        transfer_phone_number: formattedPhone,
        background_track: backgroundTrack,
        voice_provider: voiceProvider,
        retell_agent_id: voiceProvider === "retell" ? retellAgentId || null : null,
        mode: agentMode,
      } as any).eq("project_id", projectId);
      toast({ title: "Agent saved!", description: "Run test calls to fine-tune voice and delivery." });
      navigate("/agents");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
        <div className="space-y-5">
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
              <div className="flex flex-wrap gap-2 mb-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setSourceText(prompt); setDescription(prompt); }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground hover:bg-primary/5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Textarea
                value={sourceText || description}
                onChange={(e) => { setSourceText(e.target.value); setDescription(e.target.value); }}
                placeholder="Describe what your agent should do — e.g. call leads, qualify them, and transfer to a live agent..."
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
            <Button
              variant="outline"
              onClick={() => {
                setQuestions((prev) => prev.map((q) => ({
                  ...q,
                  answer: q.answer || q.suggested_default || "Use your best judgment based on industry standards",
                })));
                toast({ title: "Defaults applied", description: "Review and adjust if needed before continuing." });
              }}
              disabled={loading}
            >
              Review Defaults
            </Button>
            <Button onClick={handleSaveAnswers} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Confirm & Review
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Save */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review & Save Your Agent</h1>
            <p className="text-muted-foreground mt-1">Here's what your agent will do. Save it, then head to the Test Lab to fine-tune.</p>
          </div>

          {!showRawSpec && spec && (
            <div className="grid gap-4">
              <SummaryCard icon={<Users className="h-5 w-5" />} title="Who it calls" value={spec.mode === "inbound" ? "Handles incoming calls" : "Makes outbound calls to your contacts"} />
              <SummaryCard icon={<Phone className="h-5 w-5" />} title="What it says" value={spec.opening_line || "Standard greeting"} />
              <SummaryCard icon={<FileText className="h-5 w-5" />} title="What it collects" value={Array.isArray(spec.must_collect_fields) ? (spec.must_collect_fields as string[]).join(", ") : "Standard fields"} />
              <SummaryCard icon={<Shield className="h-5 w-5" />} title="Qualification logic" value={spec.qualification_rules ? JSON.stringify(spec.qualification_rules) : "No specific rules"} />
              <SummaryCard icon={<ArrowRight className="h-5 w-5" />} title="Transfer logic" value={transferEnabled ? `Transfers to ${transferPhone || "number below"}` : "Ends call normally"} />
              <SummaryCard icon={<Target className="h-5 w-5" />} title="Success definition" value={spec.success_definition || "Complete the call objectives"} />
              <SummaryCard icon={<Mic className="h-5 w-5" />} title="Voice" value={
                selectedVoice === "custom" 
                  ? customVoiceId || "No custom ID set" 
                  : `${blandVoices.find(v => v.voice_id === selectedVoice)?.name || selectedVoice}`
              } />
            </div>
          )}

          {/* Agent Mode */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Agent Mode</h3>
            <p className="text-xs text-muted-foreground">
              The AI detected this as <span className="font-medium text-foreground">{spec?.mode || "outbound"}</span>. Change if needed.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { value: "outbound" as const, label: "Outbound", icon: Phone, desc: "Makes calls to your contacts" },
                { value: "inbound" as const, label: "Inbound", icon: PhoneIncoming, desc: "Receives incoming calls" },
                { value: "hybrid" as const, label: "Hybrid", icon: PhoneForwarded, desc: "Both directions" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAgentMode(opt.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    agentMode === opt.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  )}
                >
                  <opt.icon className={cn("h-4 w-4 mb-1", agentMode === opt.value ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Provider */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Voice Provider</h3>
            <p className="text-xs text-muted-foreground">Choose which AI voice provider powers this agent's calls.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => setVoiceProvider("bland")}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  voiceProvider === "bland" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">Voz</p>
                <p className="text-xs text-muted-foreground">Primary provider with voice selection & background audio</p>
              </button>
              <button
                onClick={() => setVoiceProvider("retell")}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  voiceProvider === "retell" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">Append</p>
                <p className="text-xs text-muted-foreground">Alternative provider — configure voice in the Append dashboard</p>
              </button>
            </div>
            {voiceProvider === "retell" && (
              <div className="space-y-2">
                <Label>Append Agent ID</Label>
                <Input value={retellAgentId} onChange={(e) => setRetellAgentId(e.target.value)} placeholder="e.g. agent_abc123" />
                <p className="text-xs text-muted-foreground">The agent ID from your Append dashboard.</p>
              </div>
            )}
          </div>

          {/* Call Ending / Transfer */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Call Ending
            </h3>
            <p className="text-xs text-muted-foreground">Choose what happens when your agent finishes the conversation.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => setTransferEnabled(false)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  !transferEnabled ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">End call normally</p>
                <p className="text-xs text-muted-foreground">Agent wraps up and hangs up</p>
              </button>
              <button
                onClick={() => setTransferEnabled(true)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  transferEnabled ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">Transfer to live agent</p>
                <p className="text-xs text-muted-foreground">Transfers qualified callers to a phone number</p>
              </button>
            </div>
            {transferEnabled && (
              <div className="space-y-2">
                <Label>Transfer Phone Number</Label>
                <Input
                  value={transferPhone}
                  onChange={(e) => setTransferPhone(e.target.value)}
                  placeholder="e.g. (555) 123-4567"
                  type="tel"
                />
              </div>
            )}
          </div>

          {/* Voice Selection (Voz only) */}
          {voiceProvider === "bland" && (
            <div className="surface-elevated rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" /> Voice Selection
              </h3>
              <p className="text-xs text-muted-foreground">Choose a voice for your agent.</p>
              <VoiceSelector
                voices={blandVoices}
                loading={voicesLoading}
                selectedVoice={selectedVoice}
                onSelect={setSelectedVoice}
                sampleText={spec?.opening_line || undefined}
              />
              {selectedVoice === "custom" && (
                <div className="space-y-2">
                  <Label>Custom Voice Clone ID</Label>
                  <Input
                    value={customVoiceId}
                    onChange={(e) => setCustomVoiceId(e.target.value)}
                    placeholder="e.g. abc123-voice-clone-id"
                  />
                </div>
              )}
            </div>
          )}

          {/* Background Audio (Bland only) */}
          {voiceProvider === "bland" && (
            <div className="surface-elevated rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" /> Background Audio
                </h3>
                <Switch
                  checked={!!backgroundTrack}
                  onCheckedChange={(checked) => setBackgroundTrack(checked ? "office" : null)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Add ambient background noise to make your agent sound like it's calling from a real environment.</p>
              {backgroundTrack && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    { value: "office", label: "Office", desc: "Keyboard clicks, phone rings, ambient chatter" },
                    { value: "cafe", label: "Cafe", desc: "Coffee shop ambiance, background murmur" },
                    { value: "restaurant", label: "Restaurant", desc: "Dining sounds, background conversation" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBackgroundTrack(opt.value)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        backgroundTrack === opt.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
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

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSaveAgent} disabled={saving} className="flex-1" size="lg">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Agent
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
