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

  try {
    const { recording_url, retell_call_id } = await req.json();

    if (!recording_url && !retell_call_id) {
      return new Response(JSON.stringify({ error: "recording_url or retell_call_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build candidate URLs to try
    const candidates: string[] = [];

    if (recording_url) {
      candidates.push(recording_url); // WAV
      const mp3 = recording_url.replace(/\.wav(\?|$)/, ".mp3$1");
      if (mp3 !== recording_url) candidates.push(mp3);
    }

    // Try each candidate
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "audio/wav";
          const ext = contentType.includes("mpeg") || url.includes(".mp3") ? "mp3" : "wav";
          return new Response(res.body, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="recording.${ext}"`,
            },
          });
        }
      } catch { /* try next */ }
    }

    // Fallback: look up fresh URL from provider
    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (retell_call_id && RETELL_API_KEY) {
      try {
        const res = await fetch(`https://api.retellai.com/v2/get-call/${retell_call_id}`, {
          headers: { Authorization: `Bearer ${RETELL_API_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          const freshUrl = data.recording_url || data.opt_in_signed_url;
          if (freshUrl) {
            const audioRes = await fetch(freshUrl);
            if (audioRes.ok) {
              const ct = audioRes.headers.get("content-type") || "audio/wav";
              const ext = ct.includes("mpeg") ? "mp3" : "wav";
              return new Response(audioRes.body, {
                status: 200,
                headers: {
                  ...corsHeaders,
                  "Content-Type": ct,
                  "Content-Disposition": `attachment; filename="recording.${ext}"`,
                },
              });
            }
          }
        } else {
          const text = await res.text();
          console.error("Retell lookup failed:", res.status, text);
        }
      } catch (e) {
        console.error("Provider lookup error:", e);
      }
    }

    return new Response(JSON.stringify({ error: "Recording not available" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("download-recording error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
