import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBlandVoices } from "@/hooks/useBlandVoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ArrowLeft, Phone, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoicePlayButton } from "@/components/VoicePlayButton";

export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { voices, loading: voicesLoading } = useBlandVoices();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openingLine, setOpeningLine] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [{ data: project }, { data: spec }] = await Promise.all([
        supabase.from("agent_projects").select("name, description").eq("id", id).single(),
        supabase.from("agent_specs").select("voice_id, opening_line, tone_style, transfer_required, transfer_phone_number").eq("project_id", id).single(),
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
        }).eq("project_id", id),
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

      {/* Voice Selection */}
      <div className="surface-elevated rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" /> Voice
        </h3>
        {voicesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading voices from your account...
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {voices.map((voice) => (
              <button
                key={voice.voice_id}
                onClick={() => setSelectedVoice(voice.voice_id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selectedVoice === voice.voice_id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{voice.name}</p>
                  <VoicePlayButton voiceId={voice.voice_id} sampleText={openingLine || undefined} />
                </div>
                {voice.description && <p className="text-xs text-muted-foreground">{voice.description}</p>}
                {voice.is_custom && <span className="text-xs text-primary">Custom clone</span>}
              </button>
            ))}
          </div>
        )}
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

      {/* Save */}
      <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full" size="lg">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Changes
      </Button>
    </div>
  );
}
