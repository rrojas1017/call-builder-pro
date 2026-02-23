import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) {
      throw new Error("RETELL_API_KEY is not configured");
    }

    const { provider_voice_id, voice_name, public_user_id } = await req.json();

    if (!provider_voice_id || !voice_name) {
      throw new Error("provider_voice_id and voice_name are required");
    }

    // Resolve public_user_id from ElevenLabs API if not provided
    let resolvedPublicUserId = public_user_id;
    if (!resolvedPublicUserId) {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const searchRes = await fetch(
            `https://api.elevenlabs.io/v1/shared-voices?page_size=20&search=${encodeURIComponent(voice_name.split(" – ")[0])}`,
            { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
          );
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const voices = searchData.voices || [];
            const match = voices.find((v: any) => v.voice_id === provider_voice_id);
            if (match?.public_owner_id) {
              resolvedPublicUserId = match.public_owner_id;
            }
          }
        } catch (e) {
          console.warn("Failed to resolve public_user_id from ElevenLabs:", e);
        }
      }
      if (!resolvedPublicUserId) {
        throw new Error("public_user_id is required and could not be auto-resolved. Please provide it manually.");
      }
    }

    const body: Record<string, string> = {
      provider_voice_id,
      voice_name,
      voice_provider: "elevenlabs",
      public_user_id: resolvedPublicUserId,
    };

    const res = await fetch("https://api.retellai.com/add-community-voice", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      // Voice already added is not a fatal error
      if (text.includes("already added") || text.includes("already exists")) {
        return new Response(
          JSON.stringify({ success: true, already_exists: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Retell API error [${res.status}]: ${text}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, voice: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-retell-voice error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
