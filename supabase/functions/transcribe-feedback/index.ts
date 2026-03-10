import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audio_base64, format } = await req.json();
    if (!audio_base64) {
      return new Response(JSON.stringify({ error: "audio_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const audioFormat = format || "webm";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: audio_base64, format: audioFormat },
              },
              {
                type: "text",
                text: "Transcribe this audio recording verbatim. Return only the transcribed text, no labels or commentary.",
              },
            ],
          },
        ],
        max_completion_tokens: 4000,
        max_tokens: 4000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
      if (resp.status === 402) throw new Error("AI credits required. Please add credits to your workspace.");
      throw new Error(`Transcription failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("transcribe-feedback error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
