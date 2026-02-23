import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Voice {
  voice_id: string;
  name: string;
  description?: string;
  is_custom?: boolean;
  language?: string;
  gender?: string;
  accent?: string;
  preview_url?: string;
}

function deriveLanguage(accent?: string, name?: string, voiceId?: string): string {
  const s = `${accent ?? ""} ${name ?? ""} ${voiceId ?? ""}`.toLowerCase();
  // Spanish detection: mexican accent, "latin" + "spanish", or "spanish" anywhere
  if (s.includes("mexican")) return "spanish";
  if (s.includes("spanish")) return "spanish";
  if (s.includes("latin") && (s.includes("espanol") || s.includes("español"))) return "spanish";
  if (s.includes("brazilian") || s.includes("portugese") || s.includes("portuguese")) return "portuguese";
  if (s.includes("french")) return "french";
  if (s.includes("german")) return "german";
  if (s.includes("italian")) return "italian";
  if (s.includes("japanese")) return "japanese";
  if (s.includes("korean")) return "korean";
  if (s.includes("chinese") || s.includes("mandarin")) return "chinese";
  if (s.includes("hindi")) return "hindi";
  if (s.includes("arabic")) return "arabic";
  if (["american", "british", "australian", "irish", "scottish", "south african"].some(a => s.includes(a))) return "english";
  return "english";
}

export function useRetellVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-retell-voices");
      if (error) throw error;

      const raw = Array.isArray(data) ? data : data?.voices ?? [];
      const mapped: Voice[] = raw.map((v: any) => ({
        voice_id: v.voice_id ?? v.id ?? "unknown",
        name: v.voice_name ?? v.name ?? "Unknown",
        description: v.provider ?? "",
        is_custom: v.voice_type === "custom",
        language: deriveLanguage(v.accent, v.voice_name ?? v.name, v.voice_id),
        gender: v.gender?.toLowerCase() ?? undefined,
        accent: v.accent?.toLowerCase() ?? undefined,
        preview_url: v.preview_audio_url ?? undefined,
      }));
      setVoices(mapped);
    } catch (err) {
      console.error("Failed to load Retell voices:", err);
      setVoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { voices, loading, refetch: load };
}
