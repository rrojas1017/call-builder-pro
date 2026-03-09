import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRetellAgent } from "@/hooks/useRetellAgent";

import { useRetellVoices } from "@/hooks/useRetellVoices";
import { useOutboundNumbers } from "@/hooks/useOutboundNumbers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ArrowLeft, Phone, Mic, Volume2, Sparkles, Check, X, Radio, User, MessageSquare, Shield, Hash, Clock, Sliders, Globe, Plus, GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { guardOpeningLine } from "@/lib/openingLineGuard";
import { VoiceSelector } from "@/components/VoiceSelector";
import { RetellAgentManager } from "@/components/RetellAgentManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { ScriptBuilder } from "@/components/ScriptBuilder";
import { SectionHelp } from "@/components/SectionHelp";

const maturityConfig: Record<string, { label: string; color: string }> = {
  training: { label: "Training", color: "text-muted-foreground bg-muted" },
  developing: { label: "Developing", color: "text-blue-600 bg-blue-500/10 border-blue-500/30" },
  competent: { label: "Competent", color: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  expert: { label: "Expert", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  graduated: { label: "Graduated", color: "text-purple-600 bg-purple-500/10 border-purple-500/30" },
};

const LANGUAGES = [
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "pt", flag: "🇧🇷", name: "Português" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
] as const;

const DAYS_OF_WEEK = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
];

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { voices: retellVoices, loading: retellVoicesLoading, refetch: refetchVoices } = useRetellVoices();
  const { numbers: trustedNumbers } = useOutboundNumbers();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openingLine, setOpeningLine] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  
  const [retellAgentId, setRetellAgentId] = useState("");
  const [fromNumber, setFromNumber] = useState("auto");
  const [voicemailMessage, setVoicemailMessage] = useState("");
  const [ambientSound, setAmbientSound] = useState("none");
  const [maturityLevel, setMaturityLevel] = useState("training");
  const [mode, setMode] = useState("outbound");
  const [callStats, setCallStats] = useState({ total: 0, qualified: 0, avgScore: null as number | null });

  // New fields
  const [language, setLanguage] = useState("en");
  const [useCase, setUseCase] = useState("aca_prequal");
  const [mustCollectFields, setMustCollectFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [successDefinition, setSuccessDefinition] = useState("");
  const [qualificationRules, setQualificationRules] = useState("");
  const [disqualificationRules, setDisqualificationRules] = useState("");
  const [consentRequired, setConsentRequired] = useState(true);
  const [disclosureRequired, setDisclosureRequired] = useState(true);
  const [disclosureText, setDisclosureText] = useState("");
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0);
  const [temperature, setTemperature] = useState(0.7);
  const [interruptionThreshold, setInterruptionThreshold] = useState(100);
  const [businessHours, setBusinessHours] = useState({ days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "17:00", timezone: "America/New_York" });
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsMode, setSmsMode] = useState<"ai_generated" | "custom_script">("ai_generated");
  const [smsScript, setSmsScript] = useState("");

  // AI Optimization
  const { optimizeAgent } = useRetellAgent(retellAgentId || null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResults, setOptimizeResults] = useState<any>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const voices = retellVoices;
  const voicesLoading = retellVoicesLoading;

  const resolvedVoiceName = useMemo(() => {
    if (!selectedVoice || voices.length === 0) return null;
    const match = voices.find(v => v.voice_id === selectedVoice || v.name.toLowerCase() === selectedVoice.toLowerCase());
    return match?.name || selectedVoice;
  }, [selectedVoice, voices]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: project }, { data: spec }, callsRes, qualifiedRes, scoreCalls] = await Promise.all([
        supabase.from("agent_projects").select("name, description, maturity_level").eq("id", id).single(),
        supabase.from("agent_specs").select("*").eq("project_id", id).single(),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("project_id", id),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("project_id", id).eq("outcome", "qualified"),
        supabase.from("calls").select("evaluation").eq("project_id", id).not("evaluation", "is", null),
      ]);
      if (project) {
        setName(project.name);
        setDescription(project.description || "");
        setMaturityLevel(project.maturity_level || "training");
      }
      if (spec) {
        setSelectedVoice(spec.voice_id || "");
        setOpeningLine(spec.opening_line || "");
        setToneStyle(spec.tone_style || "");
        setPersonaName(spec.persona_name || "");
        setTransferEnabled(!!spec.transfer_required);
        setTransferPhone(spec.transfer_phone_number || "");
        setRetellAgentId(spec.retell_agent_id || "");
        setFromNumber(spec.from_number || "auto");
        setVoicemailMessage(spec.voicemail_message || "");
        setAmbientSound(spec.background_track || "none");
        setMode(spec.mode || "outbound");
        setLanguage(spec.language || "en");
        setUseCase(spec.use_case || "aca_prequal");
        setSuccessDefinition(spec.success_definition || "");
        setConsentRequired(spec.consent_required ?? true);
        setDisclosureRequired(spec.disclosure_required ?? true);
        setDisclosureText(spec.disclosure_text || "");
        setSpeakingSpeed(Number(spec.speaking_speed) || 1.0);
        setTemperature(Number(spec.temperature) || 0.7);
        setInterruptionThreshold(spec.interruption_threshold ?? 100);
        setSmsEnabled(spec.sms_enabled ?? false);
        setSmsMode((spec as any).sms_mode || "ai_generated");
        setSmsScript((spec as any).sms_script || "");

        // Parse JSON fields
        const mcf = spec.must_collect_fields;
        if (Array.isArray(mcf)) setMustCollectFields(mcf as string[]);
        
        const qr = spec.qualification_rules as any;
        const qrStr = qr?.description || (qr && typeof qr === "object" ? JSON.stringify(qr, null, 2) : "");
        setQualificationRules(qrStr === "{}" || qrStr === "null" ? "" : qrStr);
        
        const dr = spec.disqualification_rules as any;
        const drStr = dr?.description || (dr && typeof dr === "object" ? JSON.stringify(dr, null, 2) : "");
        setDisqualificationRules(drStr === "{}" || drStr === "null" ? "" : drStr);

        const bh = spec.business_hours as any;
        if (bh && typeof bh === "object") {
          setBusinessHours({
            days: bh.days || ["mon", "tue", "wed", "thu", "fri"],
            start: bh.start || "09:00",
            end: bh.end || "17:00",
            timezone: bh.timezone || "America/New_York",
          });
        }

      }

      // Compute avg score
      let avgScore: number | null = null;
      if (scoreCalls.data && scoreCalls.data.length > 0) {
        const scores = scoreCalls.data
          .map((c) => { const e = c.evaluation as any; return e?.overall_score ? Number(e.overall_score) : null; })
          .filter((s): s is number => s !== null);
        if (scores.length > 0) avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      }
      setCallStats({ total: callsRes.count || 0, qualified: qualifiedRes.count || 0, avgScore });

      setLoading(false);
    };
    load();
  }, [id]);

  const handleAddField = () => {
    const f = newField.trim();
    if (f && !mustCollectFields.includes(f)) {
      setMustCollectFields([...mustCollectFields, f]);
      setNewField("");
    }
  };

  const handleRemoveField = (field: string) => {
    setMustCollectFields(mustCollectFields.filter(f => f !== field));
  };

  // Drag-to-reorder state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...mustCollectFields];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(dropIndex, 0, moved);
    setMustCollectFields(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const phoneDigits = transferPhone.replace(/\D/g, "");
      if (transferEnabled && phoneDigits.length < 10) {
        toast({ title: "Invalid phone number", description: "Please enter at least 10 digits.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const formattedPhone = transferEnabled && phoneDigits.length >= 10
        ? (phoneDigits.startsWith("1") ? `+${phoneDigits}` : `+1${phoneDigits}`)
        : null;

      // Guard: auto-fix hardcoded name mismatch in opening line
      let finalOpeningLine = openingLine;
      if (openingLine && personaName.trim()) {
        const guard = guardOpeningLine(openingLine, personaName.trim());
        if (guard.wasFixed) {
          finalOpeningLine = guard.corrected;
          setOpeningLine(guard.corrected);
          toast({ title: "Opening line updated", description: `Replaced "${guard.oldName}" with your persona name placeholder.` });
        }
      }

      // Parse qualification/disqualification rules from plain language
      const parsedQR = qualificationRules.trim()
        ? { description: qualificationRules.trim() }
        : {};
      const parsedDR = disqualificationRules.trim()
        ? { description: disqualificationRules.trim() }
        : {};

      await Promise.all([
        supabase.from("agent_projects").update({ name, description }).eq("id", id),
        supabase.from("agent_specs").update({
          voice_id: selectedVoice || null,
          opening_line: finalOpeningLine || null,
          tone_style: toneStyle || null,
          persona_name: personaName.trim() || null,
          transfer_required: transferEnabled,
          transfer_phone_number: formattedPhone,
          background_track: ambientSound === "none" ? null : ambientSound,
          voice_provider: "retell",
          retell_agent_id: retellAgentId || null,
          from_number: fromNumber === "auto" ? null : fromNumber || null,
          voicemail_message: voicemailMessage.trim() || null,
          language,
          mode,
          must_collect_fields: mustCollectFields,
          success_definition: successDefinition || null,
          qualification_rules: parsedQR,
          disqualification_rules: parsedDR,
          consent_required: consentRequired,
          disclosure_required: disclosureRequired,
          disclosure_text: disclosureText || null,
          speaking_speed: speakingSpeed,
          temperature,
          interruption_threshold: interruptionThreshold,
          business_hours: businessHours,
          sms_enabled: smsEnabled,
          sms_mode: smsMode,
          sms_script: smsScript || null,
        } as any).eq("project_id", id),
      ]);

      // Auto-sync to Retell if agent is provisioned
      if (retellAgentId) {
        try {
          const langMap: Record<string, string> = {
            en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE", it: "it-IT",
          };
          await supabase.functions.invoke("manage-retell-agent", {
            body: {
              action: "update",
              agent_id: retellAgentId,
              config: {
                agent_name: personaName || name,
                voice_id: selectedVoice || undefined,
                language: langMap[language] || "en-US",
              },
            },
          });
        } catch (syncErr: any) {
          console.warn("Retell sync failed:", syncErr.message);
        }
      }

      toast({ title: "Agent saved & synced!" });
      navigate("/agents");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOptimize = async (apply = false) => {
    if (!id) return;
    setOptimizing(true);
    try {
      const result = await optimizeAgent(id, apply);
      if (result) {
        setOptimizeResults(result);
        setShowOptimizeModal(true);
        if (apply) {
          const agentCount = result.applied_agent_patches ? Object.keys(result.applied_agent_patches).length : 0;
          const llmCount = result.applied_llm_patches ? Object.keys(result.applied_llm_patches).length : 0;
          const specCount = result.applied_spec_patches ? Object.keys(result.applied_spec_patches).length : 0;
          const total = agentCount + llmCount + specCount;
          if (result.no_retell_agent) {
            toast({ title: "Optimizations saved to spec!", description: `${total} settings saved. They'll apply when you create your Retell agent.` });
          } else {
            toast({ title: "Optimizations applied!", description: `${total} settings updated.` });
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Optimization failed", description: err.message, variant: "destructive" });
    } finally {
      setOptimizing(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const priorityColor = (p: string) => p === "high" ? "destructive" : p === "medium" ? "secondary" : "outline";

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/agents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Edit Agent</h1>
        <div className="ml-auto">
          <Button variant="outline" onClick={() => handleOptimize(false)} disabled={optimizing}>
            {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Optimize with AI
          </Button>
        </div>
      </div>

      {/* Optimization Results Modal */}
      <Dialog open={showOptimizeModal} onOpenChange={setShowOptimizeModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Optimization Report
            </DialogTitle>
          </DialogHeader>
          {optimizeResults && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold text-primary">{optimizeResults.overall_score}/100</div>
                <p className="text-sm text-muted-foreground">{optimizeResults.summary}</p>
              </div>
              <div className="space-y-3">
                {optimizeResults.recommendations?.map((rec: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={priorityColor(rec.priority) as any}>{rec.priority}</Badge>
                      <Badge variant="outline">{rec.category}</Badge>
                      <span className="font-medium text-sm text-foreground">{rec.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                    <div className="flex gap-4 text-xs">
                      {rec.current_value && (
                        <span className="text-muted-foreground">Current: <code className="bg-muted px-1 rounded">{rec.current_value}</code></span>
                      )}
                      <span className="text-primary">Recommended: <code className="bg-primary/10 px-1 rounded">{rec.recommended_value}</code></span>
                    </div>
                    <p className="text-xs text-muted-foreground">Retell param: <code className="bg-muted px-1 rounded">{rec.retell_param}</code></p>
                  </div>
                ))}
              </div>
              {optimizeResults.applied_agent_patches && (
                <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-4 w-4" /> Applied {Object.keys(optimizeResults.applied_agent_patches).length} agent settings
                  </p>
                </div>
              )}
              {optimizeResults.applied_llm_patches && (
                <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-4 w-4" /> Applied {Object.keys(optimizeResults.applied_llm_patches).length} LLM settings
                  </p>
                </div>
              )}
              {optimizeResults.applied_spec_patches && (
                <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <Check className="h-4 w-4" /> Saved {Object.keys(optimizeResults.applied_spec_patches).length} settings to your agent spec
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">No Retell agent provisioned yet. These will apply when you create your agent.</p>
                </div>
              )}
              {!optimizeResults.applied_agent_patches && !optimizeResults.applied_llm_patches && !optimizeResults.applied_spec_patches && (
                <Button onClick={() => handleOptimize(true)} disabled={optimizing || !optimizeResults.recommendations?.some((r: any) => r.auto_apply)} className="w-full">
                  {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Apply All Auto-Applicable Optimizations
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Agent Profile Summary */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Agent Profile
          </h3>
          <Badge variant="outline" className={maturityConfig[maturityLevel]?.color || ""}>
            {maturityConfig[maturityLevel]?.label || maturityLevel}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Persona Name</p>
            <p className="font-medium text-foreground">{personaName || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Voice</p>
            <p className="font-medium text-foreground flex items-center gap-1">
              <Mic className="h-3 w-3 text-muted-foreground" />
              {resolvedVoiceName || "Not set"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Mode</p>
            <p className="font-medium text-foreground flex items-center gap-1">
              <Radio className="h-3 w-3 text-muted-foreground" />
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Language</p>
            <p className="font-medium text-foreground">
              {LANGUAGES.find(l => l.code === language)?.flag} {LANGUAGES.find(l => l.code === language)?.name || language}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Ambient Sound</p>
            <p className="font-medium text-foreground">{ambientSound === "none" ? "None" : ambientSound.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Transfer</p>
            <p className="font-medium text-foreground">{transferEnabled ? `Yes → ${transferPhone || "No number"}` : "Disabled"}</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">{callStats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total Calls</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">{callStats.qualified}</p>
              <p className="text-[10px] text-muted-foreground">Qualified</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">{callStats.avgScore !== null ? `${callStats.avgScore}/100` : "N/A"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Score</p>
            </div>
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-1.5">Identity <SectionHelp section="identity" /></h3>
        <div className="space-y-2">
          <Label>Agent Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>

      {/* Language & Mode */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" /> Language & Mode <SectionHelp section="language_mode" />
        </h3>
        <div className="space-y-2">
          <Label>Agent Language</Label>
          <div className="flex gap-2 flex-wrap">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  language === lang.code
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {lang.flag} {lang.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Agent Mode</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["outbound", "inbound", "hybrid"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  mode === m ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground capitalize">{m}</p>
                <p className="text-xs text-muted-foreground">
                  {m === "outbound" ? "Makes calls" : m === "inbound" ? "Receives calls" : "Both directions"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-1.5">Script <SectionHelp section="opening_line" /></h3>
        <div className="space-y-2">
          <Label>Agent Persona Name</Label>
          <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Sofia, Alex, Carlos" />
          <p className="text-xs text-muted-foreground">The name your agent introduces itself as on the call.</p>
        </div>
        <div className="space-y-2">
          <Label>Opening Line Template</Label>
          <Textarea value={openingLine} onChange={(e) => setOpeningLine(e.target.value)} rows={2} placeholder='e.g. "Hey {{first_name}}, this is {{agent_name}} calling — do you have a quick second?"' />
          <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code> and <code className="bg-muted px-1 rounded">{"{{agent_name}}"}</code> as placeholders.</p>
        </div>
        <div className="space-y-2">
          <Label>Tone / Style</Label>
          <Input value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} placeholder="e.g. friendly, professional, casual" />
        </div>
        <div className="space-y-2">
          <Label>Success Definition</Label>
          <Textarea value={successDefinition} onChange={(e) => setSuccessDefinition(e.target.value)} rows={2} placeholder="e.g. Caller is qualified and warm-transferred to a licensed agent" />
          <p className="text-xs text-muted-foreground">What counts as a successful call outcome.</p>
        </div>
        {id && (
          <ScriptBuilder
            projectId={id}
            personaName={personaName}
            useCase={useCase}
            language={language}
            toneStyle={toneStyle}
            mustCollectFields={mustCollectFields}
            currentOpeningLine={openingLine}
            onApplyOpeningLine={(line) => setOpeningLine(line)}
            onApplyTone={(tone) => setToneStyle(tone)}
          />
        )}
      </div>

      {/* Conversation Flow */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Conversation Flow <SectionHelp section="conversation_flow" />
        </h3>
        <div className="space-y-2">
          <Label>Must-Collect Fields</Label>
          <p className="text-xs text-muted-foreground">Fields the agent must collect during the call, in order.</p>
          <div className="flex flex-wrap gap-1.5">
            {mustCollectFields.map((field, index) => (
              <div
                key={field}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "cursor-grab active:cursor-grabbing transition-all",
                  draggedIndex === index && "opacity-40",
                  dragOverIndex === index && draggedIndex !== index && "ring-2 ring-primary rounded-full"
                )}
              >
                <Badge variant="secondary" className="text-xs gap-1 pr-1 select-none">
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  {field}
                  <button onClick={() => handleRemoveField(field)} className="ml-0.5 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              placeholder="e.g. zip_code, income, consent"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddField())}
            />
            <Button variant="outline" size="sm" onClick={handleAddField} disabled={!newField.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Qualification Rules */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Qualification Rules <SectionHelp section="qualification_rules" />
        </h3>
        <p className="text-xs text-muted-foreground">Describe who qualifies or doesn't in plain language — AI will structure this for your agent.</p>
        <div className="space-y-2">
          <Label>Who qualifies?</Label>
          <Textarea
            value={qualificationRules}
            onChange={(e) => setQualificationRules(e.target.value)}
            rows={3}
            placeholder="e.g. Age 18-64, household income below 400% FPL, no employer-sponsored coverage, US resident"
          />
        </div>
        <div className="space-y-2">
          <Label>Who does NOT qualify?</Label>
          <Textarea
            value={disqualificationRules}
            onChange={(e) => setDisqualificationRules(e.target.value)}
            rows={3}
            placeholder="e.g. Already has employer coverage, over 65 (Medicare eligible), currently on Medicaid"
          />
        </div>
      </div>

      {/* Compliance */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Compliance <SectionHelp section="compliance" />
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <Label>Consent Required</Label>
            <p className="text-xs text-muted-foreground">Agent must get recording consent</p>
          </div>
          <Switch checked={consentRequired} onCheckedChange={setConsentRequired} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Disclosure Required</Label>
            <p className="text-xs text-muted-foreground">Agent must read a disclosure statement</p>
          </div>
          <Switch checked={disclosureRequired} onCheckedChange={setDisclosureRequired} />
        </div>
        {disclosureRequired && (
          <div className="space-y-2">
            <Label>Disclosure Text</Label>
            <Textarea
              value={disclosureText}
              onChange={(e) => setDisclosureText(e.target.value)}
              rows={3}
              placeholder="This call may be recorded for quality assurance..."
            />
          </div>
        )}
      </div>

      {/* Voice Provider (Retell/Append) */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-1.5">Voice Provider <SectionHelp section="voice_provider" /></h3>
        <p className="text-xs text-muted-foreground">Your agent is powered by Append.</p>
        <div className="space-y-3">
          <RetellAgentManager
            retellAgentId={retellAgentId}
            onAgentIdChange={setRetellAgentId}
            personaName={personaName}
            voiceId={selectedVoice || undefined}
            language="en"
          />
          {trustedNumbers.length === 0 && fromNumber === "auto" && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">⚠ Outbound number required</p>
              <p className="text-xs text-muted-foreground mt-1">
                Append (Retell) requires a verified outbound phone number. Add one in{" "}
                <span className="font-medium text-foreground">Settings → Phone Numbers</span>, or select a specific number below.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Outbound Number */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" /> Outbound Number <SectionHelp section="outbound_number" />
        </h3>
        <p className="text-xs text-muted-foreground">Pick a trusted outbound number, or leave blank to auto-rotate from your pool.</p>
        <Select value={fromNumber} onValueChange={setFromNumber}>
          <SelectTrigger>
            <SelectValue placeholder="Auto (rotate from trusted pool)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (rotate from trusted pool)</SelectItem>
            {trustedNumbers.map((n) => (
              <SelectItem key={n.id} value={n.phone_number}>
                {n.phone_number}{n.label ? ` — ${n.label}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" /> Voice <SectionHelp section="voice" />
        </h3>
        <VoiceSelector
          voices={voices}
          loading={voicesLoading}
          selectedVoice={selectedVoice}
          onSelect={setSelectedVoice}
          sampleText={openingLine || undefined}
          defaultLanguageFilter="english"
          onRefreshVoices={refetchVoices}
        />
        <div className="space-y-2 pt-2 border-t border-border">
          <Label>Ambient Sound</Label>
          <p className="text-xs text-muted-foreground">Add background noise to make calls sound more natural and reduce echo.</p>
          <Select value={ambientSound} onValueChange={setAmbientSound}>
            <SelectTrigger>
              <SelectValue placeholder="No ambient sound" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="coffee-shop">Coffee Shop</SelectItem>
              <SelectItem value="convention-hall">Convention Hall</SelectItem>
              <SelectItem value="summer-outdoor">Summer Outdoor</SelectItem>
              <SelectItem value="mountain-outdoor">Mountain Outdoor</SelectItem>
              <SelectItem value="static-noise">Static Noise</SelectItem>
              <SelectItem value="call-center">Call Center</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Voice Tuning (Read-Only — managed by AI training) */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" /> Voice Tuning
        </h3>
        <p className="text-xs text-muted-foreground">These settings are automatically tuned by AI training based on call performance. No manual changes needed.</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm text-foreground">Speaking Speed</span>
            <Badge variant="secondary" className="font-mono">{speakingSpeed.toFixed(1)}x</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm text-foreground">Temperature</span>
            <Badge variant="secondary" className="font-mono">{temperature.toFixed(1)}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm text-foreground">Interruption Sensitivity</span>
            <Badge variant="secondary" className="font-mono">{interruptionThreshold}ms</Badge>
          </div>
        </div>
      </div>

      {/* Transfer */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" /> Call Ending <SectionHelp section="call_ending" />
        </h3>
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
            <p className="text-xs text-muted-foreground">Transfers qualified callers</p>
          </button>
        </div>
        {transferEnabled && (
          <div className="space-y-2">
            <Label>Transfer Phone Number</Label>
            <Input value={transferPhone} onChange={(e) => setTransferPhone(e.target.value)} placeholder="e.g. (555) 123-4567" type="tel" />
          </div>
        )}
      </div>

      {/* Business Hours */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Business Hours <SectionHelp section="business_hours" />
        </h3>
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.key}
                onClick={() => {
                  setBusinessHours(prev => ({
                    ...prev,
                    days: prev.days.includes(day.key)
                      ? prev.days.filter(d => d !== day.key)
                      : [...prev.days, day.key],
                  }));
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  businessHours.days.includes(day.key)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={businessHours.start}
                onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Time</Label>
              <Input
                type="time"
                value={businessHours.end}
                onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Timezone</Label>
            <Select value={businessHours.timezone} onValueChange={(v) => setBusinessHours(prev => ({ ...prev, timezone: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* SMS */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> SMS Follow-up <SectionHelp section="sms" />
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Send SMS messages after calls</p>
          </div>
          <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
        </div>

        {smsEnabled && (
          <div className="space-y-4 pt-2 border-t border-border">
            <RadioGroup value={smsMode} onValueChange={(v) => setSmsMode(v as "ai_generated" | "custom_script")} className="space-y-3">
              <div className="flex items-start gap-3">
                <RadioGroupItem value="ai_generated" id="sms-ai" className="mt-0.5" />
                <div>
                  <Label htmlFor="sms-ai" className="font-medium cursor-pointer">AI-Generated Follow-up</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">The AI will craft a personalized SMS based on the call transcript and outcome — no template needed.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <RadioGroupItem value="custom_script" id="sms-custom" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="sms-custom" className="font-medium cursor-pointer">Custom Script</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Write your own SMS template with variables like {"{{name}}"}, {"{{outcome}}"}, {"{{state}}"}.</p>
                </div>
              </div>
            </RadioGroup>

            {smsMode === "custom_script" && (
              <Textarea
                value={smsScript}
                onChange={(e) => setSmsScript(e.target.value)}
                rows={4}
                placeholder={`Hi {{name}}, thanks for chatting with us today! Based on our conversation, we'd love to help you with your {{coverage_type}} needs. Reply YES to continue or call us back at 555-123-4567.`}
              />
            )}
          </div>
        )}
      </div>

      {/* Voicemail Message */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-1.5">Voicemail Message <SectionHelp section="voicemail" /></h3>
        <p className="text-xs text-muted-foreground">If a voicemail is detected, the agent will leave this message instead of hanging up. Leave blank to just disconnect.</p>
        <Textarea
          value={voicemailMessage}
          onChange={(e) => setVoicemailMessage(e.target.value)}
          rows={3}
          placeholder="e.g. Hi, this is Sarah calling about your health coverage inquiry. Please call us back at 555-123-4567 at your convenience. Thank you!"
        />
      </div>


      {/* Save */}
      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full" size="lg">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Changes
      </Button>
    </div>
  );
}
