import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, entry_ids } = await req.json();
    if (!project_id) throw new Error("project_id required");
    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0)
      throw new Error("entry_ids array required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the recently ingested entries
    const { data: entries, error: fetchErr } = await supabase
      .from("agent_knowledge")
      .select("id, category, content, source_type, file_name")
      .in("id", entry_ids);
    if (fetchErr) throw fetchErr;
    if (!entries || entries.length === 0)
      throw new Error("No entries found for given IDs");

    // Also fetch the agent project context
    const { data: project } = await supabase
      .from("agent_projects")
      .select("name, description")
      .eq("id", project_id)
      .single();

    const { data: spec } = await supabase
      .from("agent_specs")
      .select("use_case, persona_name, tone_style, success_definition")
      .eq("project_id", project_id)
      .single();

    // Build context for the AI
    const entrySummaries = entries
      .map(
        (e: any) =>
          `[${e.category}] (source: ${e.source_type}${e.file_name ? `, file: ${e.file_name}` : ""}): ${e.content.slice(0, 500)}`
      )
      .join("\n\n");

    const agentContext = [
      project?.name ? `Agent: ${project.name}` : "",
      project?.description ? `Description: ${project.description}` : "",
      spec?.use_case ? `Use case: ${spec.use_case}` : "",
      spec?.persona_name ? `Persona: ${spec.persona_name}` : "",
      spec?.tone_style ? `Tone: ${spec.tone_style}` : "",
      spec?.success_definition
        ? `Success: ${spec.success_definition}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are an AI training specialist. You just received new knowledge data for an AI calling agent. Your job is to generate 3-8 highly targeted follow-up questions that will help maximize how this knowledge is used by the agent.

Each question should:
- Be specific to the uploaded content (reference actual details from it)
- Help clarify HOW the agent should use this knowledge (proactively vs reactively, tone, timing)
- Uncover edge cases or nuances the raw data doesn't cover
- Be answerable in 1-3 sentences

Return ONLY a JSON array where each item has:
- "question": the follow-up question text
- "rationale": a brief explanation of why this question matters (1 sentence)

No markdown fences. Aim for 3-8 questions depending on content complexity.`,
        },
        {
          role: "user",
          content: `Here is the agent context:\n${agentContext}\n\nHere are the newly uploaded knowledge entries:\n\n${entrySummaries}\n\nGenerate follow-up questions to maximize how this knowledge is used.`,
        },
      ],
    });

    let questions: { question: string; rationale: string }[] = [];
    try {
      const text = (aiResponse.content || "").trim();
      const cleaned = text
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      questions = JSON.parse(cleaned);
      if (!Array.isArray(questions)) questions = [];
    } catch {
      questions = [];
    }

    return new Response(
      JSON.stringify({ questions, count: questions.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("knowledge-wizard error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
