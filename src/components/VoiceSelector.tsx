import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Mic, Loader2, Globe } from "lucide-react";
import { VoicePlayButton } from "@/components/VoicePlayButton";
import type { BlandVoice } from "@/hooks/useBlandVoices";

interface VoiceSelectorProps {
  voices: BlandVoice[];
  loading: boolean;
  selectedVoice: string;
  onSelect: (voiceId: string) => void;
  sampleText?: string;
}

type GenderFilter = "all" | "male" | "female";

export function VoiceSelector({ voices, loading, selectedVoice, onSelect, sampleText }: VoiceSelectorProps) {
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [accentFilter, setAccentFilter] = useState("all");

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    voices.forEach((v) => {
      if (v.language) langs.add(v.language);
    });
    return Array.from(langs).sort();
  }, [voices]);

  const availableAccents = useMemo(() => {
    const accents = new Set<string>();
    voices.forEach((v) => {
      if (v.accent) accents.add(v.accent);
    });
    return Array.from(accents).sort();
  }, [voices]);

  const matchesSelected = (v: BlandVoice) =>
    v.voice_id === selectedVoice || v.name.toLowerCase() === selectedVoice.toLowerCase();

  const pinnedVoice = useMemo(
    () => (selectedVoice ? voices.find(matchesSelected) : undefined),
    [voices, selectedVoice]
  );

  const filtered = useMemo(() => {
    let result = voices;

    // Exclude pinned voice from main list
    if (selectedVoice) {
      result = result.filter((v) => !matchesSelected(v));
    }

    if (languageFilter !== "all") {
      result = result.filter((v) => v.language?.toLowerCase() === languageFilter.toLowerCase());
    }
    if (genderFilter !== "all") {
      result = result.filter((v) => v.gender === genderFilter);
    }
    if (accentFilter !== "all") {
      result = result.filter((v) => v.accent?.toLowerCase() === accentFilter.toLowerCase());
    }

    const q = search.toLowerCase();
    if (q) {
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q) ||
          v.language?.toLowerCase().includes(q) ||
          v.gender?.toLowerCase().includes(q) ||
          v.accent?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [voices, search, languageFilter, genderFilter, accentFilter, selectedVoice]);

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
      {/* Gender toggle */}
      <div className="flex gap-1">
        {(["all", "male", "female"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGenderFilter(g)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
              genderFilter === g
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
            )}
          >
            {g === "all" ? "All" : g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* Language + Accent filters + Search */}
      <div className="flex gap-2 flex-wrap">
        {availableLanguages.length > 1 && (
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-[140px]">
              <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {availableLanguages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {availableAccents.length > 1 && (
          <Select value={accentFilter} onValueChange={setAccentFilter}>
            <SelectTrigger className="w-[150px]">
              <Mic className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Accent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accents</SelectItem>
              {availableAccents.map((acc) => (
                <SelectItem key={acc} value={acc}>
                  {acc.charAt(0).toUpperCase() + acc.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length + (pinnedVoice ? 1 : 0)} of {voices.length} voices
      </p>

      {/* Pinned selected voice */}
      {pinnedVoice && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Selected</p>
          <VoiceCard
            voice={pinnedVoice}
            selected
            onSelect={onSelect}
            sampleText={sampleText}
          />
        </div>
      )}

      {/* Scrollable list */}
      <ScrollArea className="max-h-[420px]">
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
                    selected={matchesSelected(voice)}
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
                    selected={matchesSelected(voice)}
                    onSelect={onSelect}
                    sampleText={sampleText}
                  />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No voices match your filters</p>
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
        "rounded-lg border p-3 text-left transition-colors w-full",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{voice.name}</p>
        <VoicePlayButton voiceId={voice.voice_id} sampleText={sampleText} />
      </div>
      {voice.description && <p className="text-xs text-muted-foreground">{voice.description}</p>}
      <div className="flex gap-2 mt-1 flex-wrap">
        {voice.is_custom && <span className="text-xs text-primary">Custom clone</span>}
        {voice.gender && <span className="text-xs text-muted-foreground capitalize">{voice.gender}</span>}
        {voice.accent && <span className="text-xs text-muted-foreground capitalize">{voice.accent}</span>}
      </div>
    </button>
  );
}
