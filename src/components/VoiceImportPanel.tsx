import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CURATED_SPANISH_VOICES, type CuratedVoice } from "@/lib/curatedSpanishVoices";
import { toast } from "sonner";

interface VoiceImportPanelProps {
  existingVoiceNames: string[];
  onImported: () => void;
}

export function VoiceImportPanel({ existingVoiceNames, onImported }: VoiceImportPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const lowerExisting = existingVoiceNames.map((n) => n.toLowerCase());

  const availableVoices = CURATED_SPANISH_VOICES.filter(
    (v) => !lowerExisting.some((n) => n.includes(v.voice_name.split(" – ")[0].toLowerCase()))
  );

  if (availableVoices.length === 0) return null;

  const handleImport = async (voice: CuratedVoice) => {
    setImporting(voice.provider_voice_id);
    try {
      const { data, error } = await supabase.functions.invoke("import-retell-voice", {
        body: {
          provider_voice_id: voice.provider_voice_id,
          voice_name: voice.voice_name,
          public_user_id: voice.public_user_id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImported((prev) => new Set(prev).add(voice.provider_voice_id));
      toast.success(`${voice.voice_name} imported successfully`);
      onImported();
    } catch (err: any) {
      toast.error(err.message || "Failed to import voice");
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="border border-dashed border-primary/30 rounded-lg p-3 bg-primary/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <p className="text-sm font-medium text-primary">
            Import More Spanish Voices
          </p>
          <p className="text-xs text-muted-foreground">
            {availableVoices.length} ElevenLabs voices available to import
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="grid gap-2 sm:grid-cols-2 mt-3">
          {availableVoices.map((voice) => {
            const isImported = imported.has(voice.provider_voice_id);
            const isImporting = importing === voice.provider_voice_id;

            return (
              <div
                key={voice.provider_voice_id}
                className="rounded-lg border border-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{voice.voice_name}</p>
                  <div className="flex gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                      {voice.gender}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {voice.accent}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isImported ? "ghost" : "outline"}
                  disabled={isImporting || isImported}
                  onClick={() => handleImport(voice)}
                  className="ml-2 shrink-0"
                >
                  {isImporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isImported ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
