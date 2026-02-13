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
    const BLAND_API_KEY = Deno.env.get("BLAND_API_KEY");
    if (!BLAND_API_KEY) throw new Error("BLAND_API_KEY is not configured");

    const { voice_id, text } = await req.json();
    if (!voice_id) throw new Error("voice_id is required");

    const sampleText = text || "Hello, this is a voice sample. How does this sound to you?";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(`https://api.bland.ai/v1/voices/${voice_id}/sample`, {
      method: "POST",
      headers: {
        authorization: BLAND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: sampleText }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Bland API error [${res.status}]: ${errText}`);
    }

    const audioData = await res.arrayBuffer();

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      },
    });
  } catch (err) {
    console.error("generate-voice-sample error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
