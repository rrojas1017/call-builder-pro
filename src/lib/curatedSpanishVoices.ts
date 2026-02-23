/** Curated ElevenLabs Spanish community voices available for import into Retell. */
export interface CuratedVoice {
  provider_voice_id: string;
  voice_name: string;
  gender: "male" | "female";
  accent: string;
  public_user_id?: string;
}

export const CURATED_SPANISH_VOICES: CuratedVoice[] = [
  {
    provider_voice_id: "pFZP5JQG7iQjIQuC4Bku",
    voice_name: "Lily – Spanish",
    gender: "female",
    accent: "Castilian",
  },
  {
    provider_voice_id: "onwK4e9ZLuTAKqWW03F9",
    voice_name: "Daniel – Spanish",
    gender: "male",
    accent: "Castilian",
  },
  {
    provider_voice_id: "cgSgspJ2msm6clMCkdW9",
    voice_name: "Jessica – Latin American",
    gender: "female",
    accent: "Latin American",
  },
  {
    provider_voice_id: "iP95p4xoKVk53GoZ742B",
    voice_name: "Chris – Latin American",
    gender: "male",
    accent: "Latin American",
  },
  {
    provider_voice_id: "EXAVITQu4vr4xnSDxMaL",
    voice_name: "Sarah – Mexican",
    gender: "female",
    accent: "Mexican",
  },
  {
    provider_voice_id: "TX3LPaxmHKxFdv7VOQHJ",
    voice_name: "Liam – Mexican",
    gender: "male",
    accent: "Mexican",
  },
  {
    provider_voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_name: "George – Spanish Neutral",
    gender: "male",
    accent: "Neutral",
  },
  {
    provider_voice_id: "XrExE9yKIg1WjnnlVkGX",
    voice_name: "Matilda – Spanish Neutral",
    gender: "female",
    accent: "Neutral",
  },
];
