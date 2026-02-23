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

    // Resolve public_user_id: use provided value, or try ElevenLabs API, or use default for premade voices
    let resolvedPublicUserId = public_user_id;
    if (!resolvedPublicUserId) {
      // Default ElevenLabs public user ID for their premade/default voices
      const ELEVENLABS_DEFAULT_OWNER = "000000000000000000000000";

      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          // Try fetching the specific voice to get its public_owner_id
          const voiceRes = await fetch(
            `https://api.elevenlabs.io/v1/voices/${provider_voice_id}`,
            { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
          );
          if (voiceRes.ok) {
            const voiceData = await voiceRes.json();
            if (voiceData.sharing?.public_owner_id) {
              resolvedPublicUserId = voiceData.sharing.public_owner_id;
              console.log(`Resolved public_owner_id from voice detail: ${resolvedPublicUserId}`);
            }
          } else {
            console.warn(`ElevenLabs voice lookup failed with status ${voiceRes.status}`);
          }
        } catch (e) {
          console.warn("Failed to resolve public_user_id from ElevenLabs:", e);
        }
      }

      // Fall back to default ElevenLabs owner ID for premade voices
      if (!resolvedPublicUserId) {
        console.log(`Using default ElevenLabs owner ID for voice ${provider_voice_id}`);
        resolvedPublicUserId = ELEVENLABS_DEFAULT_OWNER;
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
