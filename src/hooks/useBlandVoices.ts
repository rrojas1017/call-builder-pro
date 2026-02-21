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
  preview_url?: string;
}

const ACCENT_KEYWORDS: Record<string, string> = {
  american: "american",
  british: "british",
  australian: "australian",
  indian: "indian",
  french: "french",
  german: "german",
  dutch: "dutch",
  italian: "italian",
  spanish: "spanish",
  "brazilian-portuguese": "brazilian",
  brazilian: "brazilian",
  portuguese: "portuguese",
};

const LANGUAGE_KEYWORDS = [
  "english", "french", "spanish", "german", "italian",
  "dutch", "portuguese", "hindi", "arabic", "mandarin",
  "japanese", "korean",
];

function extractFromTags(tags: string[]): { gender?: string; language?: string; accent?: string } {
  const lower = tags.map((t) => t.toLowerCase().trim());
  let gender: string | undefined;
  if (lower.includes("female")) gender = "female";
  else if (lower.includes("male")) gender = "male";

  let language: string | undefined;
  for (const l of LANGUAGE_KEYWORDS) {
    if (lower.includes(l)) { language = l; break; }
  }

  let accent: string | undefined;
  for (const tag of lower) {
    if (ACCENT_KEYWORDS[tag]) { accent = ACCENT_KEYWORDS[tag]; break; }
  }

  return { gender, language, accent };
}

function extractAccentFromDesc(desc: string): string | undefined {
  for (const [keyword, value] of Object.entries(ACCENT_KEYWORDS)) {
    if (desc.includes(keyword)) return value;
  }
  return undefined;
}

export function useBlandVoices() {
  const [voices, setVoices] = useState<BlandVoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-bland-voices");
        if (error) throw error;

        const raw = Array.isArray(data) ? data : data?.voices ?? data?.data ?? [];
        const mapped: BlandVoice[] = raw.map((v: any) => {
          const desc = (v.description ?? "").toLowerCase();
          const tags: string[] = Array.isArray(v.tags) ? v.tags : [];
          const tagMeta = extractFromTags(tags);

          // Gender: tags first, then description fallback
          let gender = tagMeta.gender;
          if (!gender) {
            if (desc.includes("female")) gender = "female";
            else if (desc.includes("male")) gender = "male";
          }

          // Accent: tags first, then description fallback
          const accent = tagMeta.accent ?? extractAccentFromDesc(desc);

          // Language: tags first, then existing field fallback
          const language = tagMeta.language ?? v.language ?? v.lang ?? undefined;

          return {
            voice_id: v.id ?? v.voice_id ?? v.name,
            name: v.name ?? v.voice_id ?? "Unknown",
            description: v.description ?? "",
            is_custom: !!v.user_id,
            language,
            gender,
            accent,
          };
        });
        setVoices(mapped);
      } catch (err) {
        console.error("Failed to load Bland voices:", err);
        setVoices([{ voice_id: "maya", name: "Maya", description: "Default voice" }]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { voices, loading };
}
