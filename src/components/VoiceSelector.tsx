import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, Mic, Loader2 } from "lucide-react";
import { VoicePlayButton } from "@/components/VoicePlayButton";
import type { BlandVoice } from "@/hooks/useBlandVoices";

interface VoiceSelectorProps {
  voices: BlandVoice[];
  loading: boolean;
  selectedVoice: string;
  onSelect: (voiceId: string) => void;
  sampleText?: string;
}

export function VoiceSelector({ voices, loading, selectedVoice, onSelect, sampleText }: VoiceSelectorProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) => v.name.toLowerCase().includes(q) || (v.description?.toLowerCase().includes(q))
    );
  }, [voices, search]);

  const customVoices = filtered.filter((v) => v.is_custom);
  const presetVoices = filtered.filter((v) => !v.is_custom);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading voices...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search voices..."
          className="pl-9"
        />
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {voices.length} voices
      </p>

      {/* Scrollable list */}
      <ScrollArea className="max-h-[320px]">
        <div className="space-y-4 pr-3">
          {/* Custom clones group */}
          {customVoices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your Clones</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {customVoices.map((voice) => (
                  <VoiceCard
                    key={voice.voice_id}
                    voice={voice}
                    selected={selectedVoice === voice.voice_id}
                    onSelect={onSelect}
                    sampleText={sampleText}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Preset voices group */}
          {presetVoices.length > 0 && (
            <div className="space-y-2">
              {customVoices.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preset Voices</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {presetVoices.map((voice) => (
                  <VoiceCard
                    key={voice.voice_id}
                    voice={voice}
                    selected={selectedVoice === voice.voice_id}
                    onSelect={onSelect}
                    sampleText={sampleText}
                  />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No voices match "{search}"</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function VoiceCard({
  voice,
  selected,
  onSelect,
  sampleText,
}: {
  voice: BlandVoice;
  selected: boolean;
  onSelect: (id: string) => void;
  sampleText?: string;
}) {
  return (
    <button
      onClick={() => onSelect(voice.voice_id)}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{voice.name}</p>
        <VoicePlayButton voiceId={voice.voice_id} sampleText={sampleText} />
      </div>
      {voice.description && <p className="text-xs text-muted-foreground">{voice.description}</p>}
      {voice.is_custom && <span className="text-xs text-primary">Custom clone</span>}
    </button>
  );
}
