import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL knowledge entries (no limit)
    const { data: entries, error } = await supabase
      .from("agent_knowledge")
      .select("id, category, content")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false });

    // Increment usage_count for all entries being pulled into a prompt
    if (entries && entries.length > 0) {
      const entryIds = entries.map((e: any) => e.id);
      try {
        const { error: rpcErr } = await supabase.rpc("increment_knowledge_usage", { entry_ids: entryIds });
        if (rpcErr) console.warn("Failed to increment usage_count:", rpcErr.message);
      } catch (rpcCatchErr: any) {
        console.warn("Failed to increment usage_count:", rpcCatchErr.message);
      }
    }

    if (error) throw error;

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({
        briefing: "No additional knowledge configured.",
        entries_count: 0,
        characters_reduced: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Format entries for summarization
    const rawText = entries
      .map((e: any) => `[${e.category}] ${e.content}`)
      .join("\n");
    const rawLength = rawText.length;

    // Call Lovable AI (Gemini Flash) for compression
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "You are a knowledge compressor for a phone sales agent. Compress the following knowledge entries into a single briefing paragraph of MAXIMUM 500 characters. Include only the most critical business rules, product details, and objection handling tips. Return ONLY the briefing text, nothing else."
            },
            { role: "user", content: rawText },
          ],
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("AI gateway error:", aiResp.status, errText);
        // Fallback: return truncated raw knowledge
        const fallback = rawText.substring(0, 500);
        return new Response(JSON.stringify({
          briefing: fallback,
          entries_count: entries.length,
          characters_reduced: rawLength - fallback.length,
          fallback: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiData = await aiResp.json();
      let briefing = aiData.choices?.[0]?.message?.content?.trim() || "";

      // Guard: truncate if AI exceeds 500 chars
      if (briefing.length > 500) {
        briefing = briefing.substring(0, 500);
      }

      console.log(`Knowledge compressed: ${entries.length} entries, ${rawLength} chars → ${briefing.length} chars`);

      return new Response(JSON.stringify({
        briefing,
        entries_count: entries.length,
        characters_reduced: rawLength - briefing.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (aiErr: any) {
      console.error("AI summarization failed:", aiErr.message);
      // Fallback: truncated raw knowledge
      const fallback = rawText.substring(0, 500);
      return new Response(JSON.stringify({
        briefing: fallback,
        entries_count: entries.length,
        characters_reduced: rawLength - fallback.length,
        fallback: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err: any) {
    console.error("summarize-agent-knowledge error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
