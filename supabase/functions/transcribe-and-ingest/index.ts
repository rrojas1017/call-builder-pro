import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, file_path, source_label } = await req.json();
    if (!project_id || !file_path) {
      return new Response(JSON.stringify({ error: "project_id and file_path are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Step 1: Download audio from storage ──────────────────────────────
    console.log(`Downloading audio from storage: ${file_path}`);
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("agent_knowledge_sources")
      .download(file_path);

    if (downloadErr || !fileData) {
      throw new Error(`Failed to download audio: ${downloadErr?.message}`);
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binary);

    // Detect format from file extension
    const ext = file_path.split(".").pop()?.toLowerCase() || "mp3";
    const formatMap: Record<string, string> = {
      mp3: "mp3",
      wav: "wav",
      m4a: "m4a",
      mp4: "mp4",
      ogg: "ogg",
    };
    const audioFormat = formatMap[ext] || "mp3";

    console.log(`Audio downloaded, size: ${uint8Array.length} bytes, format: ${audioFormat}`);

    // ── Step 2: Transcribe using Gemini 2.5 Flash ────────────────────────
    console.log("Transcribing with Gemini 2.5 Flash...");
    const transcribeRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                input_audio: { data: base64Audio, format: audioFormat },
              },
              {
                type: "text",
                text: "Transcribe this call recording verbatim. Include speaker labels if discernible (e.g. Agent:, Prospect:). This is a sales call recording that happened after a prospect was transferred from an AI pre-qualifier to a human sales agent. Be thorough and accurate.",
              },
            ],
          },
        ],
        max_completion_tokens: 8000,
      }),
    });

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text();
      if (transcribeRes.status === 429) throw new Error("Rate limit exceeded during transcription. Please try again later.");
      if (transcribeRes.status === 402) throw new Error("AI credits required. Please add credits to your workspace.");
      throw new Error(`Transcription failed (${transcribeRes.status}): ${errText}`);
    }

    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.choices?.[0]?.message?.content || "";

    if (!transcript.trim()) {
      throw new Error("Transcription returned empty result. Please check the audio file.");
    }

    console.log(`Transcript obtained, length: ${transcript.length} chars`);

    // ── Step 3: Extract knowledge using Claude Sonnet 4 ──────────────────
    console.log("Extracting insights with Claude Sonnet 4...");

    const labelNote = source_label ? `\nRecording label: "${source_label}"` : "";

    const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system: `You are analyzing a recording of a sales conversation that happened AFTER a qualified prospect was transferred from an AI pre-qualifier to a human closer/agent. Your goal is to extract actionable insights that would help the AI pre-qualifier do a better job of qualifying, preparing prospects, and setting up the transfer for success.

Extract insights in these categories:
- "objection_handling": objections that emerged or persisted after transfer that the AI didn't handle
- "winning_pattern": specific phrases, transitions, openings, or techniques the human agent used that worked
- "conversation_technique": pacing, rapport, tone, or conversational structure insights
- "product_knowledge": any product/service details, pricing, features clarified post-transfer

Return ONLY a valid JSON array (no markdown, no explanation) like:
[
  {"category": "winning_pattern", "content": "The human agent started by re-establishing rapport with 'I know you just spoke with our pre-qualifier, I just want to confirm a couple things...' which immediately lowered resistance."},
  {"category": "objection_handling", "content": "After transfer, prospect raised price concern. Agent used 'compared to what you're currently spending on...' framing to reframe cost."}
]

Be specific and actionable. Each entry should be a concrete, usable insight for the AI agent. Aim for 5-15 entries.`,
        messages: [
          {
            role: "user",
            content: `Here is the post-transfer call transcript:${labelNote}\n\n${transcript}`,
          },
        ],
      }),
    });

    if (!extractRes.ok) {
      const errText = await extractRes.text();
      throw new Error(`Knowledge extraction failed (${extractRes.status}): ${errText}`);
    }

    const extractData = await extractRes.json();
    const rawContent = extractData.content?.[0]?.text || "[]";

    let insights: Array<{ category: string; content: string }> = [];
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      insights = JSON.parse(cleaned);
      if (!Array.isArray(insights)) insights = [];
    } catch (e) {
      console.error("Failed to parse insights JSON:", rawContent);
      throw new Error("Failed to parse knowledge extraction response. Please try again.");
    }

    console.log(`Extracted ${insights.length} insights`);

    // ── Step 4: Insert into agent_knowledge ───────────────────────────────
    const validCategories = ["objection_handling", "winning_pattern", "conversation_technique", "product_knowledge", "industry_insight", "competitor_info"];

    const rows = insights
      .filter((i) => i.category && i.content && i.content.trim().length > 10)
      .map((i) => ({
        project_id,
        category: validCategories.includes(i.category) ? i.category : "conversation_technique",
        content: i.content.trim(),
        source_type: "transfer_recording",
        source_url: source_label || null,
      }));

    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: "No actionable insights found in this recording." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertErr } = await supabase.from("agent_knowledge").insert(rows);
    if (insertErr) throw new Error(`Failed to save insights: ${insertErr.message}`);

    console.log(`Successfully inserted ${rows.length} knowledge entries`);

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("transcribe-and-ingest error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
