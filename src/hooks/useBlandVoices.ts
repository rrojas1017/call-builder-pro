import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BlandVoice {
  voice_id: string;
  name: string;
  description?: string;
  is_custom?: boolean;
}

export function useBlandVoices() {
  const [voices, setVoices] = useState<BlandVoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-bland-voices");
        if (error) throw error;

        // Bland API returns { voices: [...] } with id, name, description
        const raw = Array.isArray(data) ? data : data?.voices ?? data?.data ?? [];
        const mapped: BlandVoice[] = raw.map((v: any) => ({
          voice_id: v.id ?? v.voice_id ?? v.name,
          name: v.name ?? v.voice_id ?? "Unknown",
          description: v.description ?? "",
          is_custom: !!v.user_id,
        }));
        setVoices(mapped);
      } catch (err) {
        console.error("Failed to load Bland voices:", err);
        // Fallback to a single known-good voice
        setVoices([{ voice_id: "maya", name: "Maya", description: "Default voice" }]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { voices, loading };
}
