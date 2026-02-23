import { useEffect, useState } from "react";
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
import { Loader2, Save, ArrowLeft, Phone, Mic, Volume2, Sparkles, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VoiceSelector } from "@/components/VoiceSelector";
import { RetellAgentManager } from "@/components/RetellAgentManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { voices: retellVoices, loading: retellVoicesLoading } = useRetellVoices();
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

  // AI Optimization
  const { optimizeAgent } = useRetellAgent(retellAgentId || null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResults, setOptimizeResults] = useState<any>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const voices = retellVoices;
  const voicesLoading = retellVoicesLoading;

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: project }, { data: spec }] = await Promise.all([
        supabase.from("agent_projects").select("name, description").eq("id", id).single(),
        supabase.from("agent_specs").select("voice_id, opening_line, tone_style, persona_name, transfer_required, transfer_phone_number, background_track, voice_provider, retell_agent_id, from_number, voicemail_message").eq("project_id", id).single(),
      ]);
      if (project) {
        setName(project.name);
        setDescription(project.description || "");
      }
      if (spec) {
        setSelectedVoice(spec.voice_id || "");
        setOpeningLine(spec.opening_line || "");
        setToneStyle(spec.tone_style || "");
        setPersonaName((spec as any).persona_name || "");
        setTransferEnabled(!!spec.transfer_required);
        setTransferPhone(spec.transfer_phone_number || "");
        
        setRetellAgentId((spec as any).retell_agent_id || "");
        setFromNumber((spec as any).from_number || "auto");
        setVoicemailMessage((spec as any).voicemail_message || "");
      }
      setLoading(false);
    };
    load();
  }, [id]);

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

      await Promise.all([
        supabase.from("agent_projects").update({ name, description }).eq("id", id),
        supabase.from("agent_specs").update({
          voice_id: selectedVoice || null,
          opening_line: openingLine || null,
          tone_style: toneStyle || null,
          persona_name: personaName.trim() || null,
          transfer_required: transferEnabled,
          transfer_phone_number: formattedPhone,
          background_track: null,
          voice_provider: "retell",
          retell_agent_id: retellAgentId || null,
          from_number: fromNumber === "auto" ? null : fromNumber || null,
          voicemail_message: voicemailMessage.trim() || null,
        } as any).eq("project_id", id),
      ]);

      toast({ title: "Agent updated!" });
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
          toast({ title: "Optimizations applied!", description: `${result.applied_agent_patches ? Object.keys(result.applied_agent_patches).length : 0} settings updated.` });
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
              {!optimizeResults.applied_agent_patches && (
                <Button onClick={() => handleOptimize(true)} disabled={optimizing} className="w-full">
                  {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Apply All Auto-Applicable Optimizations
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Identity */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Identity</h3>
        <div className="space-y-2">
          <Label>Agent Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>

      {/* Voice Provider (Retell/Append) */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Voice Provider</h3>
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


      {/* Script */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Script</h3>
        <div className="space-y-2">
          <Label>Agent Persona Name</Label>
          <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Sofia, Alex, Carlos" />
          <p className="text-xs text-muted-foreground">The name your agent introduces itself as on the call. Used to fill in <code className="bg-muted px-1 rounded">{"{{agent_name}}"}</code> in your opening line.</p>
        </div>
        <div className="space-y-2">
          <Label>Opening Line Template</Label>
          <Textarea value={openingLine} onChange={(e) => setOpeningLine(e.target.value)} rows={2} placeholder='e.g. "Hey {{first_name}}, this is {{agent_name}} calling — do you have a quick second?"' />
          <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code> and <code className="bg-muted px-1 rounded">{"{{agent_name}}"}</code> as placeholders. This is a guide, not a verbatim script.</p>
        </div>
        <div className="space-y-2">
          <Label>Tone / Style</Label>
          <Input value={toneStyle} onChange={(e) => setToneStyle(e.target.value)} placeholder="e.g. friendly, professional, casual" />
        </div>
      </div>

      {/* Outbound Number */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" /> Outbound Number
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
          <Mic className="h-4 w-4 text-primary" /> Voice
        </h3>
        <VoiceSelector
          voices={voices}
          loading={voicesLoading}
          selectedVoice={selectedVoice}
          onSelect={setSelectedVoice}
          sampleText={openingLine || undefined}
        />
      </div>

      {/* Transfer */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" /> Call Ending
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

      {/* Voicemail Message */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Voicemail Message</h3>
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
