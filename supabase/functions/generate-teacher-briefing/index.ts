import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("use_case, qualification_rules, disqualification_rules, must_collect_fields, tone_style")
      .eq("project_id", project_id)
      .single();

    if (specErr || !spec) throw new Error("Agent spec not found");

    const difficulties = ["Easy", "Medium", "Hard"];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    const prompt = `You are generating a "Teacher Briefing" for a human who is about to receive a phone call from an AI sales/enrollment agent. The human needs to pretend to be a realistic prospect while also deliberately challenging the AI to expose weaknesses.

AGENT CONTEXT:
- Use case: ${spec.use_case || "general outbound"}
- Tone: ${spec.tone_style || "professional"}
- Fields the agent must collect: ${JSON.stringify(spec.must_collect_fields || [])}
- Qualification rules: ${JSON.stringify(spec.qualification_rules || [])}
- Disqualification rules: ${JSON.stringify(spec.disqualification_rules || [])}

DIFFICULTY: ${difficulty}

Generate a briefing with:
1. A fake persona (name, age, brief life situation relevant to the agent's vertical)
2. Exactly 4 challenge scenarios the human should try during the call. These MUST target the specific fields the agent collects and the qualification/disqualification rules. For "${difficulty}" difficulty:
   - Easy: be cooperative but slightly forgetful
   - Medium: be skeptical, ask questions back, hesitate on key info
   - Hard: be hostile, interrupt, refuse info, test edge cases

Return ONLY valid JSON with this exact structure, no markdown:
{"persona":{"name":"...","age":number,"situation":"..."},"challenges":["challenge 1","challenge 2","challenge 3","challenge 4"],"difficulty":"${difficulty}"}`;

    const result = await callAI({
      provider: "gemini",
      messages: [
        { role: "system", content: "You output only valid JSON. No markdown, no explanation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 500,
    });

    let briefing;
    try {
      const text = result.content || "{}";
      // Strip markdown fences if present
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      briefing = JSON.parse(cleaned);
    } catch {
      briefing = {
        persona: { name: "Alex Johnson", age: 35, situation: "Recently changed jobs, unsure about current coverage options." },
        challenges: [
          "Say you're not sure about your income",
          "Ask how they got your number",
          "Interrupt mid-sentence and change the topic",
          "Say you need to talk to your spouse first",
        ],
        difficulty,
      };
    }

    return new Response(JSON.stringify(briefing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-teacher-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
