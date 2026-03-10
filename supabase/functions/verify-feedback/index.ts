import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";
import { buildTaskPrompt, resolveBeginMessage } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * VERIFY-FEEDBACK: Runs a short targeted simulation to verify that feedback
 * was actually applied to the agent's behavior.
 *
 * Input: { project_id, feedback_text, field_changed? }
 * Output: { verified: boolean, evidence: string, transcript: string }
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, feedback_text, field_changed } = await req.json();
    if (!project_id || !feedback_text) throw new Error("project_id and feedback_text required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Load latest agent spec + knowledge
    const { data: spec, error: specErr } = await sb
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    const { data: knowledge } = await sb
      .from("agent_knowledge")
      .select("category, content")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const callerName = "Maria Garcia";
    const agentPrompt = buildTaskPrompt(spec, knowledge || [], undefined, callerName);

    const openingLine = spec.opening_line
      ? resolveBeginMessage(spec.opening_line, spec.persona_name)
      : `Hi, this is ${spec.persona_name || "your agent"}. How are you doing today?`;

    // Build a customer persona specifically designed to trigger the feedback behavior
    const customerPrompt = `You are playing a REAL PERSON receiving a phone call. Stay in character.

YOUR NAME: Maria Garcia
YOUR DETAILS:
- Age: 42
- State: TX
- Phone: (555) 321-4567

SCENARIO: You are receiving a call. Your goal is to have a natural conversation that specifically tests whether the agent demonstrates this behavior: "${feedback_text}"

IMPORTANT RULES:
- Respond naturally as a real person (1-3 sentences)
- Give the agent opportunities to demonstrate the expected behavior
- If the feedback is about how the agent opens, greets, or introduces themselves — pay attention to their first message
- If the feedback is about asking for information — be ready to provide it when asked
- If the feedback is about tone or style — engage normally and let the agent show its style
- Use natural speech patterns
- Speak in ${spec.language === "es" ? "Spanish" : "English"}`;

    // Run a short 5-turn conversation
    const agentMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: agentPrompt },
    ];
    const customerMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: customerPrompt },
    ];

    const transcriptLines: string[] = [];

    // Agent opens
    transcriptLines.push(`Agent: ${openingLine}`);
    customerMessages.push({ role: "user", content: openingLine });
    agentMessages.push({ role: "assistant", content: openingLine });

    for (let turn = 0; turn < 5; turn++) {
      // Customer responds
      const custReply = await callAI({
        provider: "gemini",
        model: "google/gemini-2.5-flash-lite",
        messages: customerMessages,
        temperature: 0.7,
        max_tokens: 150,
      });
      const custText = (custReply.content?.trim() || "(silence)")
        .replace(/^(Customer|Caller|User|Me|Maria):\s*/i, "").trim();

      transcriptLines.push(`User: ${custText}`);
      customerMessages.push({ role: "assistant", content: custText });
      agentMessages.push({ role: "user", content: custText });

      // Agent responds
      const agentReply = await callAI({
        provider: "gemini",
        model: "google/gemini-2.5-flash-lite",
        messages: agentMessages,
        temperature: 0.6,
        max_tokens: 200,
      });
      const agentText = (agentReply.content?.trim() || "(silence)")
        .replace(/^(Agent|AI|Assistant|Rep):\s*/i, "").trim();

      transcriptLines.push(`Agent: ${agentText}`);
      agentMessages.push({ role: "assistant", content: agentText });
      customerMessages.push({ role: "user", content: agentText });
    }

    const transcript = transcriptLines.join("\n");

    // Now use AI to judge whether the feedback behavior is present
    const judgeReply = await callAI({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a call quality evaluator. Given a transcript and a piece of feedback that was applied to an AI agent, determine whether the agent's behavior in the transcript reflects the feedback.

Return a JSON object with:
- "verified": true/false — does the agent demonstrate the requested behavior?
- "evidence": a specific quote or observation from the transcript that proves/disproves it (1-2 sentences)

Be strict but fair. The feedback behavior should be clearly observable in the transcript.`,
        },
        {
          role: "user",
          content: `FEEDBACK APPLIED: "${feedback_text}"
${field_changed ? `FIELD CHANGED: ${field_changed}` : ""}

TRANSCRIPT:
${transcript}

Does the agent demonstrate the behavior described in the feedback? Return JSON only.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    let verified = false;
    let evidence = "Could not determine verification status.";

    try {
      const raw = judgeReply.content || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        verified = !!parsed.verified;
        evidence = parsed.evidence || evidence;
      }
    } catch {
      // Use defaults
    }

    return new Response(
      JSON.stringify({ verified, evidence, transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[verify-feedback] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
