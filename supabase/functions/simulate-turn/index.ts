import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";
import { buildTaskPrompt, resolveBeginMessage } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "init") {
      return await handleInit(body);
    } else if (action === "turn") {
      return await handleTurn(body);
    } else {
      throw new Error("action must be 'init' or 'turn'");
    }
  } catch (err) {
    console.error("[simulate-turn] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleInit(body: any) {
  const { project_id, customer_difficulty = "medium", customer_name } = body;
  if (!project_id) throw new Error("project_id required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

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
    .limit(30);

  const names = ["Maria Garcia", "James Wilson", "Sarah Johnson", "Carlos Martinez", "Jennifer Thompson", "David Brown", "Lisa Anderson", "Michael Davis", "Patricia Rodriguez", "Robert Taylor", "Amanda Mitchell", "Jose Hernandez"];
  const callerName = customer_name || names[Math.floor(Math.random() * names.length)];
  const agentSystem = buildTaskPrompt(spec, knowledge || [], undefined, callerName);

  const openingLine = spec.opening_line
    ? resolveBeginMessage(spec.opening_line, spec.persona_name)
    : `Hi, this is ${spec.persona_name || "your agent"}. How are you doing today?`;

  const customerSystem = buildCustomerPrompt(spec, customer_difficulty, callerName);

  return new Response(
    JSON.stringify({
      agent_system: agentSystem,
      customer_system: customerSystem,
      opening_line: openingLine,
      agent_name: spec.persona_name || "Agent",
      customer_name: callerName,
      use_case: spec.use_case || "general",
      language: spec.language || "en",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleTurn(body: any) {
  const { role, agent_system, customer_system, history } = body;
  if (!role || !history) throw new Error("role and history required");

  const systemPrompt = role === "customer" ? customer_system : agent_system;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    if (role === "customer") {
      if (msg.speaker === "agent") {
        messages.push({ role: "user", content: msg.content });
      } else {
        messages.push({ role: "assistant", content: msg.content });
      }
    } else {
      if (msg.speaker === "customer") {
        messages.push({ role: "user", content: msg.content });
      } else {
        messages.push({ role: "assistant", content: msg.content });
      }
    }
  }

  const reply = await callAI({
    provider: "gemini",
    messages,
    temperature: role === "customer" ? 0.8 : 0.6,
    max_tokens: 512,
  });

  let text = reply.content?.trim() || "(silence)";
  text = text
    .replace(/^(Agent|AI|Assistant|Rep|Representative|Customer|Caller|User|Me|Maria|James|Sarah|Carlos|Jennifer|David|Lisa|Michael|Patricia|Robert|Amanda|Jose):\s*/i, "")
    .trim();

  return new Response(
    JSON.stringify({ content: text, role }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function buildCustomerPrompt(spec: any, difficulty: string, callerName: string): string {
  const useCase = spec.use_case || spec.mode || "general outbound call";
  const language = spec.language || "en";

  const difficultyTraits: Record<string, string> = {
    easy: `You are cooperative and friendly. You answer questions directly, are interested in the offering, and go along with the conversation.`,
    medium: `You are realistic — cautiously interested but not a pushover. You sometimes hesitate, ask "why do you need that?", go off-topic briefly, and have 1-2 mild objections like "I'm not sure I need this" or "Can I think about it?"`,
    hard: `You are challenging. You're skeptical ("How do I know this is legit?"), give vague answers, have strong objections ("I've been burned before"), create time pressure ("I only have 2 minutes"), but CAN be won over by a skilled agent.`,
  };

  const traits = difficultyTraits[difficulty] || difficultyTraits.medium;
  const customerData = generateCustomerData(useCase);

  return `You are ${callerName}, a real person receiving a phone call. Stay in character.

YOUR DETAILS:
${customerData}

SCENARIO: Receiving a call about: ${useCase}

PERSONALITY: ${traits}

RULES:
- Respond ONLY as the customer (1-3 sentences)
- Be natural: "yeah", "uh-huh", "well...", "let me think..."
- Only share info when asked — don't volunteer everything
- Speak in ${language === "es" ? "Spanish" : "English"}
- React naturally to awkward agent behavior`;
}

function generateCustomerData(useCase: string): string {
  const uc = useCase.toLowerCase();
  const age = [28, 35, 42, 48, 55, 62][Math.floor(Math.random() * 6)];
  const states = ["TX", "FL", "CA", "NY", "OH", "GA"];
  const state = states[Math.floor(Math.random() * states.length)];
  const zips: Record<string, string> = { TX: "75201", FL: "33101", CA: "90001", NY: "10001", OH: "43201", GA: "30301" };

  let details = `Age: ${age}, State: ${state}, Zip: ${zips[state] || "10001"}`;

  if (uc.includes("health") || uc.includes("insurance") || uc.includes("aca")) {
    const income = [22000, 32000, 45000, 58000][Math.floor(Math.random() * 4)];
    const household = [1, 2, 3, 4][Math.floor(Math.random() * 4)];
    const coverage = ["uninsured", "employer coverage", "Medicaid", "private plan expiring"][Math.floor(Math.random() * 4)];
    details += `, Income: $${income.toLocaleString()}, Household: ${household}, Coverage: ${coverage}`;
  } else if (uc.includes("solar")) {
    const bill = [150, 220, 300][Math.floor(Math.random() * 3)];
    details += `, Homeowner: ${Math.random() > 0.3 ? "Yes" : "No"}, Electric bill: $${bill}/mo`;
  } else if (uc.includes("debt") || uc.includes("loan")) {
    const debt = [8000, 22000, 45000][Math.floor(Math.random() * 3)];
    details += `, Debt: $${debt.toLocaleString()}, Type: credit card + medical`;
  }

  return details;
}
