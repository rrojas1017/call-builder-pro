import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch last 5 successful (qualified) calls with transcripts
    const { data: successCalls } = await supabase
      .from("calls")
      .select("id, transcript, outcome, created_at")
      .eq("project_id", project_id)
      .eq("outcome", "qualified")
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!successCalls || successCalls.length < 5) {
      console.log(`Only ${successCalls?.length || 0} successful calls, need 5. Skipping.`);
      return new Response(JSON.stringify({ skipped: true, reason: "not_enough_successes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch last 5 unsuccessful calls with transcripts
    const { data: failCalls } = await supabase
      .from("calls")
      .select("id, transcript, outcome, created_at")
      .eq("project_id", project_id)
      .in("outcome", ["completed", "disqualified"])
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    // If all calls are successful, no contrast to learn from
    if (!failCalls || failCalls.length === 0) {
      console.log("No unsuccessful calls to compare against. Skipping.");
      return new Response(JSON.stringify({ skipped: true, reason: "no_contrast" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build comparison prompt
    const successTranscripts = successCalls
      .map((c, i) => `--- SUCCESSFUL CALL ${i + 1} ---\n${c.transcript}`)
      .join("\n\n");

    const failTranscripts = failCalls
      .map((c, i) => `--- UNSUCCESSFUL CALL ${i + 1} (${c.outcome}) ---\n${c.transcript}`)
      .join("\n\n");

    const systemPrompt = `You are a Sales Call Analyst specializing in pattern recognition.

Compare the successful call transcripts (qualified leads) against the unsuccessful ones (completed without qualification or disqualified).

Extract 3-5 SPECIFIC, ACTIONABLE winning patterns. Focus on:
- Opening approaches that led to engagement vs. hang-ups
- How objections were handled differently in successful calls
- Specific phrases or transitions that kept the caller engaged
- How data collection flowed differently (order, timing, framing of questions)
- Rapport-building techniques present in wins but absent in losses

Each pattern must be a concrete, replicable technique — not vague advice like "be friendly." 
Example good pattern: "Successful calls asked about the caller's current situation before mentioning benefits, creating a consultative tone"
Example bad pattern: "Be more empathetic"`;

    const userPrompt = `SUCCESSFUL CALLS (qualified):\n\n${successTranscripts}\n\nUNSUCCESSFUL CALLS:\n\n${failTranscripts}`;

    const aiResponse = await callAI({
      provider: "gemini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_winning_patterns",
          description: "Return the winning patterns identified from comparing successful vs unsuccessful calls.",
          parameters: {
            type: "object",
            properties: {
              winning_patterns: {
                type: "array",
                items: { type: "string" },
                description: "3-5 specific, actionable winning patterns",
              },
            },
            required: ["winning_patterns"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_winning_patterns" } },
    });

    const toolResult = aiResponse.tool_calls[0]?.arguments as { winning_patterns: string[] } | undefined;
    if (!toolResult?.winning_patterns?.length) {
      console.log("AI returned no patterns");
      return new Response(JSON.stringify({ skipped: true, reason: "no_patterns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate against existing winning_pattern entries
    const { data: existing } = await supabase
      .from("agent_knowledge")
      .select("content")
      .eq("project_id", project_id)
      .eq("category", "winning_pattern");

    const existingSet = new Set(
      (existing || []).map((e: { content: string }) => e.content.toLowerCase().trim())
    );

    const newPatterns = toolResult.winning_patterns.filter(
      (p) => !existingSet.has(p.toLowerCase().trim())
    );

    if (newPatterns.length === 0) {
      console.log("All patterns already exist. Skipping insert.");
      return new Response(JSON.stringify({ skipped: true, reason: "all_duplicates" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save new patterns to agent_knowledge
    const { error: insertErr } = await supabase.from("agent_knowledge").insert(
      newPatterns.map((content) => ({
        project_id,
        content,
        category: "winning_pattern",
        source_type: "success_analysis",
      }))
    );

    if (insertErr) throw insertErr;

    console.log(`Saved ${newPatterns.length} winning patterns for project ${project_id}`);

    return new Response(JSON.stringify({
      patterns_saved: newPatterns.length,
      patterns: newPatterns,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("learn-from-success error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
