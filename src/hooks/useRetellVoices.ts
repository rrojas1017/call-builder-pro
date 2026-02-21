import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BlandVoice } from "@/hooks/useBlandVoices";

export function useRetellVoices() {
  const [voices, setVoices] = useState<BlandVoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-retell-voices");
        if (error) throw error;

        const raw = Array.isArray(data) ? data : data?.voices ?? [];
        const mapped: BlandVoice[] = raw.map((v: any) => ({
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
