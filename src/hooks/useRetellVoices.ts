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

export function useRetellVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-retell-voices");
        if (error) throw error;

        const raw = Array.isArray(data) ? data : data?.voices ?? [];
        const mapped: Voice[] = raw.map((v: any) => ({
          voice_id: v.voice_id ?? v.id ?? "unknown",
          name: v.voice_name ?? v.name ?? "Unknown",
          description: v.provider ?? "",
          is_custom: v.voice_type === "custom",
          language: v.language ?? undefined,
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
    load();
  }, []);

  return { voices, loading };
}
