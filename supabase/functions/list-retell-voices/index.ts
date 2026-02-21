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

    const res = await fetch("https://api.retellai.com/list-voices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Retell API error [${res.status}]: ${text}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("list-retell-voices error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
