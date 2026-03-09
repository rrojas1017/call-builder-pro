import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Mic, Loader2, Globe } from "lucide-react";
import { VoicePlayButton } from "@/components/VoicePlayButton";
import { VoiceImportPanel } from "@/components/VoiceImportPanel";
import type { Voice } from "@/hooks/useRetellVoices";

interface VoiceSelectorProps {
  voices: Voice[];
  loading: boolean;
  selectedVoice: string;
  onSelect: (voiceId: string) => void;
  sampleText?: string;
  defaultLanguageFilter?: string;
  onRefreshVoices?: () => void;
}

type GenderFilter = "all" | "male" | "female";

export function VoiceSelector({ voices, loading, selectedVoice, onSelect, sampleText, defaultLanguageFilter, onRefreshVoices }: VoiceSelectorProps) {
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState(defaultLanguageFilter ?? "all");
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

  const matchesSelected = (v: Voice) =>
    v.voice_id === selectedVoice || v.name.toLowerCase() === selectedVoice.toLowerCase();

  const pinnedVoice = useMemo(() => {
    if (!selectedVoice) return undefined;
    const match = voices.find(matchesSelected);
    if (!match) return undefined;
    if (genderFilter !== "all" && match.gender !== genderFilter) return undefined;
    if (languageFilter !== "all" && match.language?.toLowerCase() !== languageFilter.toLowerCase()) return undefined;
    if (accentFilter !== "all" && match.accent?.toLowerCase() !== accentFilter.toLowerCase()) return undefined;
    return match;
  }, [voices, selectedVoice, genderFilter, languageFilter, accentFilter]);

  const filtered = useMemo(() => {
    let result = voices;
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
  const presetVoices = filtered.filter((v) => !v.is_custom).sort((a, b) => {
    const aIsMinimax = a.name.toLowerCase().startsWith("minimax-") ? 1 : 0;
    const bIsMinimax = b.name.toLowerCase().startsWith("minimax-") ? 1 : 0;
    return bIsMinimax - aIsMinimax;
  });

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

      {/* Count + excluded note */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Showing {filtered.length + (pinnedVoice ? 1 : 0)} of {voices.length} voices</p>
        {(genderFilter !== "all" || accentFilter !== "all") && (() => {
          const unclassified = voices.filter(v =>
            (genderFilter !== "all" && !v.gender) ||
            (accentFilter !== "all" && !v.accent)
          ).length;
          return unclassified > 0 ? (
            <p className="text-muted-foreground/70">
              {unclassified} voice{unclassified !== 1 ? "s" : ""} excluded (missing metadata)
            </p>
          ) : null;
        })()}
      </div>

      {/* Pinned selected voice */}
      {pinnedVoice && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Selected</p>
          <VoiceCard voice={pinnedVoice} selected onSelect={onSelect} sampleText={sampleText} />
        </div>
      )}

      {/* Scrollable list */}
      <div className="max-h-[420px] overflow-y-auto">
        <div className="space-y-4 pr-3">
          {customVoices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your Clones</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {customVoices.map((voice) => (
                  <VoiceCard key={voice.voice_id} voice={voice} selected={matchesSelected(voice)} onSelect={onSelect} sampleText={sampleText} />
                ))}
              </div>
            </div>
          )}
          {presetVoices.length > 0 && (
            <div className="space-y-2">
              {customVoices.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preset Voices</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {presetVoices.map((voice) => (
                  <VoiceCard key={voice.voice_id} voice={voice} selected={matchesSelected(voice)} onSelect={onSelect} sampleText={sampleText} />
                ))}
              </div>
            </div>
          )}
          {filtered.length === 0 && !pinnedVoice && (
            <p className="text-sm text-muted-foreground text-center py-4">No voices match your filters</p>
          )}

          {/* Import panel for non-English languages */}
          {languageFilter === "spanish" && onRefreshVoices && (
            <VoiceImportPanel
              existingVoiceNames={voices.map((v) => v.name)}
              onImported={onRefreshVoices}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceCard({
  voice,
  selected,
  onSelect,
  sampleText,
}: {
  voice: Voice;
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
        <VoicePlayButton voiceId={voice.voice_id} previewUrl={voice.preview_url} />
      </div>
      {voice.description && <p className="text-xs text-muted-foreground mt-1">{voice.description}</p>}
      <div className="flex gap-1.5 mt-1.5 flex-wrap">
        {voice.is_custom && <Badge variant="default" className="text-[10px] px-1.5 py-0">Clone</Badge>}
        {voice.gender && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{voice.gender}</Badge>}
        {voice.accent && <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{voice.accent}</Badge>}
        {voice.language && <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{voice.language}</Badge>}
      </div>
    </button>
  );
}
