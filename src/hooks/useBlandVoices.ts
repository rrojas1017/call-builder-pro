import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BlandVoice {
  voice_id: string;
  name: string;
  description?: string;
  is_custom?: boolean;
  language?: string;
  gender?: string;
  accent?: string;
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
        const mapped: BlandVoice[] = raw.map((v: any) => {
          const desc = (v.description ?? "").toLowerCase();
          let gender: string | undefined;
          if (desc.includes("female")) gender = "female";
          else if (desc.includes("male")) gender = "male";

          let accent: string | undefined;
          if (desc.includes("british")) accent = "british";
          else if (desc.includes("australian")) accent = "australian";
          else if (desc.includes("american")) accent = "american";

          return {
            voice_id: v.id ?? v.voice_id ?? v.name,
            name: v.name ?? v.voice_id ?? "Unknown",
            description: v.description ?? "",
            is_custom: !!v.user_id,
            language: v.language ?? v.lang ?? undefined,
            gender,
            accent,
          };
        });
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
