import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBlandVoices } from "@/hooks/useBlandVoices";
import { useOutboundNumbers } from "@/hooks/useOutboundNumbers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ArrowLeft, Phone, Mic, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VoiceSelector } from "@/components/VoiceSelector";

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { voices, loading: voicesLoading } = useBlandVoices();
  const { numbers: trustedNumbers } = useOutboundNumbers();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openingLine, setOpeningLine] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [backgroundTrack, setBackgroundTrack] = useState<string | null>(null);
  const [voiceProvider, setVoiceProvider] = useState<"bland" | "retell">("bland");
  const [retellAgentId, setRetellAgentId] = useState("");
  const [fromNumber, setFromNumber] = useState("auto");
  const [voicemailMessage, setVoicemailMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: project }, { data: spec }] = await Promise.all([
        supabase.from("agent_projects").select("name, description").eq("id", id).single(),
        supabase.from("agent_specs").select("voice_id, opening_line, tone_style, transfer_required, transfer_phone_number, background_track, voice_provider, retell_agent_id, from_number, voicemail_message").eq("project_id", id).single(),
      ]);
      if (project) {
        setName(project.name);
        setDescription(project.description || "");
      }
      if (spec) {
        setSelectedVoice(spec.voice_id || "");
        setOpeningLine(spec.opening_line || "");
        setToneStyle(spec.tone_style || "");
        setTransferEnabled(!!spec.transfer_required);
        setTransferPhone(spec.transfer_phone_number || "");
        setBackgroundTrack((spec as any).background_track || null);
        setVoiceProvider(((spec as any).voice_provider as "bland" | "retell") || "bland");
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
          transfer_required: transferEnabled,
          transfer_phone_number: formattedPhone,
          background_track: backgroundTrack,
          voice_provider: voiceProvider,
          retell_agent_id: voiceProvider === "retell" ? retellAgentId || null : null,
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

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/agents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Edit Agent</h1>
      </div>

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

      {/* Script */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Script</h3>
        <div className="space-y-2">
          <Label>Opening Line</Label>
          <Textarea value={openingLine} onChange={(e) => setOpeningLine(e.target.value)} rows={2} placeholder="What the agent says first..." />
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

      {voiceProvider === "bland" && (
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
      )}

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

      {/* Save */}
      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full" size="lg">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Changes
      </Button>
    </div>
  );
}
