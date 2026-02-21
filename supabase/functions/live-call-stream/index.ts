import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const BLAND_API_KEY = Deno.env.get("BLAND_API_KEY");
  if (!BLAND_API_KEY) {
    return new Response(JSON.stringify({ error: "BLAND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { call_id, action } = await req.json();

    if (!call_id || !action) {
      return new Response(JSON.stringify({ error: "call_id and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "transcript") {
      // Use Call Details endpoint which returns actual transcripts
      const res = await fetch(`https://api.bland.ai/v1/calls/${call_id}`, {
        method: "GET",
        headers: { authorization: BLAND_API_KEY },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Bland call details error:", res.status, text);
        return new Response(JSON.stringify({ error: `Bland API error: ${res.status}`, transcripts: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const rawTranscripts = Array.isArray(data.transcripts) ? data.transcripts : [];

      // Map Bland's format to our format
      const transcripts = rawTranscripts.map((t: any) => ({
        id: String(t.id),
        text: t.text || "",
        role: t.user === "assistant" ? "agent" : "caller",
        created_at: t.created_at || null,
      }));

      return new Response(JSON.stringify({ 
        transcripts, 
        status: data.status || null,
        concatenated_transcript: data.concatenated_transcript || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "retell_transcript") {
      const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
      if (!RETELL_API_KEY) {
        return new Response(JSON.stringify({ error: "RETELL_API_KEY not configured", transcripts: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`https://api.retellai.com/v2/get-call/${call_id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${RETELL_API_KEY}` },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Retell get-call error:", res.status, text);
        return new Response(JSON.stringify({ error: `Retell API error: ${res.status}`, transcripts: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const transcripts: any[] = [];

      // Retell returns transcript as a string "Agent: hi\nUser: hello" or as an array
      if (typeof data.transcript === "string" && data.transcript.trim()) {
        const segments = data.transcript.split("\n").filter((s: string) => s.trim());
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const colonIdx = seg.indexOf(":");
          if (colonIdx === -1) continue;
          const speaker = seg.slice(0, colonIdx).trim().toLowerCase();
          const text = seg.slice(colonIdx + 1).trim();
          if (!text) continue;
          transcripts.push({
            id: `retell-${i}`,
            text,
            role: speaker === "agent" || speaker === "assistant" ? "agent" : "caller",
          });
        }
      } else if (Array.isArray(data.transcript_object)) {
        for (let i = 0; i < data.transcript_object.length; i++) {
          const t = data.transcript_object[i];
          transcripts.push({
            id: `retell-${i}`,
            text: t.content || t.text || "",
            role: t.role === "agent" ? "agent" : "caller",
          });
        }
      }

      return new Response(JSON.stringify({
        transcripts,
        status: data.call_status || data.status || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "listen") {
      // Get WebSocket URL for live audio
      const res = await fetch(`https://api.bland.ai/v1/calls/${call_id}/listen`, {
        method: "POST",
        headers: {
          authorization: BLAND_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Bland listen error:", res.status, text);
        let userMessage = `Failed to get listen URL: ${res.status}`;
        try {
          const errData = JSON.parse(text);
          const blandMsg = errData?.errors?.[0]?.message || errData?.message;
          if (blandMsg) userMessage = blandMsg;
        } catch { /* use default message */ }
        return new Response(JSON.stringify({ error: userMessage }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const wsUrl = data?.data?.url || data?.url || data?.websocket_url;
      return new Response(JSON.stringify({ websocket_url: wsUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'transcript' or 'listen'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("live-call-stream error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
