import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAuth, AuthError, unauthorizedResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let auth;
  try { auth = await requireAuth(req); } catch (e) {
    if (e instanceof AuthError) return unauthorizedResponse(e.message);
    throw e;
  }
  console.log(`[live-call-stream] Authenticated user=${auth.userId} org=${auth.orgId}`);

  const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
  if (!RETELL_API_KEY) {
    return new Response(JSON.stringify({ error: "RETELL_API_KEY not configured", transcripts: [] }), {
      status: 200,
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

    if (action === "transcript" || action === "retell_transcript") {
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

      console.log("Retell response keys:", Object.keys(data));
      console.log("transcript type:", typeof data.transcript, "length:", data.transcript?.length);
      console.log("transcript_object:", Array.isArray(data.transcript_object), data.transcript_object?.length);
      console.log("transcript_with_tool_calls:", Array.isArray(data.transcript_with_tool_calls), data.transcript_with_tool_calls?.length);
      console.log("call_status:", data.call_status || data.status);

      const transcripts: any[] = [];

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

      if (transcripts.length === 0 && Array.isArray(data.transcript_with_tool_calls)) {
        for (let i = 0; i < data.transcript_with_tool_calls.length; i++) {
          const entry = data.transcript_with_tool_calls[i];
          if (entry.role && entry.content) {
            transcripts.push({
              id: `live-${i}`,
              text: entry.content,
              role: entry.role === "agent" ? "agent" : "caller",
            });
          }
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

    return new Response(JSON.stringify({ error: "Invalid action. Use 'transcript'." }), {
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
