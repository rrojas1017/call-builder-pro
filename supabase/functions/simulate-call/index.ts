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
 * SIMULATE-CALL: AI-vs-AI conversation to train agents without real phone calls.
 *
 * Input: {
 *   project_id: string,
 *   customer_persona?: string,
 *   customer_difficulty?: "easy" | "medium" | "hard",
 *   max_turns?: number,
 *   simulate_scenario?: string,
 * }
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      project_id,
      customer_persona,
      customer_difficulty = "medium",
      max_turns = 12,
      simulate_scenario,
    } = await req.json();

    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Load agent spec and knowledge ──
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

    // Build the agent's actual prompt (same one used for real calls)
    const callerNames = ["Maria Garcia", "James Wilson", "Sarah Johnson", "Carlos Martinez", "Jennifer Thompson", "David Brown", "Lisa Anderson", "Michael Davis", "Patricia Rodriguez", "Robert Taylor", "Amanda Mitchell", "Jose Hernandez"];
    const callerName = callerNames[Math.floor(Math.random() * callerNames.length)];
    const agentPrompt = buildTaskPrompt(spec, knowledge || [], undefined, callerName);

    // Build the agent's opening line
    const openingLine = spec.opening_line
      ? resolveBeginMessage(spec.opening_line, spec.persona_name)
      : `Hi, this is ${spec.persona_name || "your agent"}. How are you doing today?`;

    // ── Build customer persona ──
    const customerSystemPrompt = buildCustomerPrompt(spec, customer_persona, customer_difficulty, simulate_scenario);

    // ── Run multi-turn conversation ──
    const safeTurns = Math.min(Math.max(max_turns, 6), 20);
    const transcript = await runConversation(
      agentPrompt,
      customerSystemPrompt,
      openingLine,
      safeTurns,
    );

    // ── Get org_id from project ──
    const { data: project } = await sb
      .from("agent_projects")
      .select("org_id")
      .eq("id", project_id)
      .single();

    if (!project) throw new Error("Project not found");

    // ── Save as a call record ──
    const { data: callRecord, error: callErr } = await sb
      .from("calls")
      .insert({
        org_id: project.org_id,
        project_id,
        direction: "outbound",
        voice_provider: "simulated",
        transcript,
        started_at: new Date(Date.now() - 120_000).toISOString(),
        ended_at: new Date().toISOString(),
        duration_seconds: Math.round(safeTurns * 10),
        outcome: "completed",
        version: spec.version || 1,
        summary: { simulated: true, difficulty: customer_difficulty, scenario: simulate_scenario || "general" },
      })
      .select("id")
      .single();

    if (callErr) throw callErr;

    // ── Trigger evaluation ──
    const evalResp = await fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ call_id: callRecord.id }),
    });

    let evaluation = null;
    if (evalResp.ok) {
      const evalData = await evalResp.json();
      evaluation = evalData.evaluation || null;
    }

    return new Response(
      JSON.stringify({
        call_id: callRecord.id,
        transcript,
        evaluation,
        turns: safeTurns,
        difficulty: customer_difficulty,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[simulate-call] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════════
// Helper: Build Customer AI Persona
// ═══════════════════════════════════════════════════════════════════

function buildCustomerPrompt(
  spec: any,
  customPersona: string | undefined,
  difficulty: string,
  scenario: string | undefined
): string {
  const useCase = spec.use_case || spec.mode || "general outbound call";
  const language = spec.language || "en";
  const fields = spec.must_collect_fields || [];

  const difficultyTraits: Record<string, string> = {
    easy: `You are a cooperative, friendly caller who answers questions directly.
- You're interested in what the agent is offering
- You provide clear, complete answers when asked
- You're patient and easy-going
- You might ask 1-2 simple questions but generally go along with the conversation`,

    medium: `You are a realistic caller — somewhat interested but not a pushover.
- You're cautiously interested but have some hesitations
- Sometimes you give partial answers or ask "why do you need that?"
- You might go off-topic briefly or share a personal story
- You have 1-2 mild objections ("I'm not sure I need this", "Can I think about it?")
- You sometimes pause or say "um" or "let me think..."`,

    hard: `You are a challenging caller who makes the agent work for it.
- You're skeptical and ask tough questions ("How do I know this is legit?", "Who gave you my number?")
- You give vague or incomplete answers that need follow-up
- You interrupt the agent mid-sentence sometimes
- You have strong objections ("I've been burned before", "I'm on the do not call list")
- You might try to change the subject or rush the agent
- You might say "I only have 2 minutes" to create time pressure
- Despite being difficult, you CAN be won over by a skilled agent`,
  };

  const traits = difficultyTraits[difficulty] || difficultyTraits.medium;
  const customerData = generateCustomerData(useCase, fields);

  let prompt = `You are playing the role of a REAL PERSON receiving a phone call. You must stay in character at all times.

YOUR NAME: ${customerData.name}
YOUR DETAILS:
${customerData.details}

SCENARIO: ${scenario || `You are receiving a call related to: ${useCase}`}

PERSONALITY:
${traits}

IMPORTANT RULES:
- Respond ONLY as the customer — never break character
- Keep responses natural and conversational (1-3 sentences typically)
- React like a real person would — not robotic, not scripted
- If the agent asks for information you have in YOUR DETAILS, provide it naturally
- If asked something not in your details, make up something reasonable that fits
- Do NOT volunteer all your information at once — wait to be asked
- Speak in ${language === "es" ? "Spanish" : language === "fr" ? "French" : language === "pt" ? "Portuguese" : "English"}
- Use natural speech patterns: "yeah", "uh-huh", "I mean...", "well..."
- If the agent does something awkward (repeats themselves, sounds robotic), react naturally to it`;

  if (customPersona) {
    prompt += `\n\nADDITIONAL PERSONA NOTES: ${customPersona}`;
  }

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════
// Helper: Generate realistic customer data for the persona
// ═══════════════════════════════════════════════════════════════════

function generateCustomerData(useCase: string, _fields: string[]): { name: string; details: string } {
  const uc = useCase.toLowerCase();

  const names = [
    "Maria Garcia", "James Wilson", "Sarah Johnson", "Carlos Martinez",
    "Jennifer Thompson", "David Brown", "Lisa Anderson", "Michael Davis",
    "Patricia Rodriguez", "Robert Taylor", "Amanda Mitchell", "Jose Hernandez",
  ];
  const name = names[Math.floor(Math.random() * names.length)];

  const ages = [28, 32, 38, 42, 47, 53, 58, 63];
  const age = ages[Math.floor(Math.random() * ages.length)];

  const states = ["TX", "FL", "CA", "NY", "IL", "PA", "OH", "GA", "NC", "AZ"];
  const state = states[Math.floor(Math.random() * states.length)];

  const zips: Record<string, string> = {
    TX: "75201", FL: "33101", CA: "90001", NY: "10001", IL: "60601",
    PA: "19101", OH: "43201", GA: "30301", NC: "27601", AZ: "85001",
  };

  let details = `- Age: ${age}
- State: ${state}
- Zip Code: ${zips[state] || "10001"}
- Phone: (555) ${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}
- Email: ${name.toLowerCase().replace(" ", ".")}@email.com`;

  if (uc.includes("health") || uc.includes("insurance") || uc.includes("aca") || uc.includes("medicare")) {
    const incomes = [18000, 24000, 32000, 42000, 55000, 68000];
    const income = incomes[Math.floor(Math.random() * incomes.length)];
    const householdSizes = [1, 2, 3, 4, 5];
    const household = householdSizes[Math.floor(Math.random() * householdSizes.length)];
    const coverageStatuses = ["uninsured", "has employer coverage", "has Medicaid", "private plan expiring soon"];
    const coverage = coverageStatuses[Math.floor(Math.random() * coverageStatuses.length)];

    details += `
- Annual Household Income: $${income.toLocaleString()}
- Household Size: ${household}
- Current Coverage: ${coverage}
- Has had coverage gap in last 60 days: ${Math.random() > 0.5 ? "Yes" : "No"}`;
  } else if (uc.includes("solar")) {
    const homeOwnership = Math.random() > 0.3 ? "Homeowner" : "Renter";
    const electricBills = [120, 180, 220, 280, 350];
    const bill = electricBills[Math.floor(Math.random() * electricBills.length)];

    details += `
- Home Status: ${homeOwnership}
- Monthly Electric Bill: $${bill}
- Roof Age: ${Math.floor(Math.random() * 20) + 3} years
- Interested in saving money: Yes`;
  } else if (uc.includes("debt") || uc.includes("financial") || uc.includes("loan")) {
    const debts = [5000, 12000, 25000, 45000, 75000];
    const debt = debts[Math.floor(Math.random() * debts.length)];

    details += `
- Estimated Debt: $${debt.toLocaleString()}
- Type: ${Math.random() > 0.5 ? "Credit card" : "Medical + credit card"}
- Employment: ${Math.random() > 0.3 ? "Employed full-time" : "Part-time"}
- Considered bankruptcy: ${Math.random() > 0.7 ? "Yes" : "No"}`;
  } else {
    details += `
- Occupation: ${["Teacher", "Nurse", "IT Specialist", "Retail Manager", "Self-employed"][Math.floor(Math.random() * 5)]}
- Has interacted with similar service before: ${Math.random() > 0.5 ? "Yes" : "No"}`;
  }

  return { name, details };
}

// ═══════════════════════════════════════════════════════════════════
// Core: Run AI-vs-AI Conversation
// ═══════════════════════════════════════════════════════════════════

async function runConversation(
  agentSystemPrompt: string,
  customerSystemPrompt: string,
  openingLine: string,
  maxTurns: number,
): Promise<string> {
  const agentMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: agentSystemPrompt },
  ];
  const customerMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: customerSystemPrompt },
  ];

  const transcriptLines: string[] = [];

  // Agent opens the conversation
  transcriptLines.push(`Agent: ${openingLine}`);
  customerMessages.push({ role: "user", content: openingLine });
  agentMessages.push({ role: "assistant", content: openingLine });

  for (let turn = 0; turn < maxTurns; turn++) {
    // ── Customer responds ──
    const customerReply = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      messages: customerMessages,
      temperature: 0.8,
      max_tokens: 200,
    });

    const customerText = customerReply.content?.trim() || "(silence)";
    const cleanCustomer = customerText
      .replace(/^(Customer|Caller|User|Me|Maria|James|Sarah|Carlos|Jennifer|David|Lisa|Michael|Patricia|Robert|Amanda|Jose):\s*/i, "")
      .trim();

    transcriptLines.push(`User: ${cleanCustomer}`);
    customerMessages.push({ role: "assistant", content: cleanCustomer });
    agentMessages.push({ role: "user", content: cleanCustomer });

    // Check for natural conversation end signals
    const endSignals = [
      /\b(goodbye|bye|have a good|take care|talk later|hang up)\b/i,
      /\b(no thanks|not interested|don't call|stop calling)\b/i,
    ];
    const customerEnded = endSignals.some((r) => r.test(cleanCustomer));

    // ── Agent responds ──
    const agentReply = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      messages: agentMessages,
      temperature: 0.6,
      max_tokens: 250,
    });

    const agentText = agentReply.content?.trim() || "(silence)";
    const cleanAgent = agentText
      .replace(/^(Agent|AI|Assistant|Rep|Representative):\s*/i, "")
      .trim();

    transcriptLines.push(`Agent: ${cleanAgent}`);
    agentMessages.push({ role: "assistant", content: cleanAgent });
    customerMessages.push({ role: "user", content: cleanAgent });

    // End if either party wrapped up
    const agentEnded = /\b(goodbye|bye|have a (great|good)|thank you for your time|enjoy your|take care)\b/i.test(cleanAgent);

    if (customerEnded || agentEnded) {
      if (agentEnded && !customerEnded) {
        const finalCustomer = await callAI({
          provider: "gemini",
          model: "google/gemini-3-flash-preview",
          messages: [...customerMessages],
          temperature: 0.7,
          max_tokens: 50,
        });
        if (finalCustomer.content?.trim()) {
          const finalText = finalCustomer.content.trim()
            .replace(/^(Customer|Caller|User|Me):\s*/i, "")
            .trim();
          transcriptLines.push(`User: ${finalText}`);
        }
      }
      break;
    }
  }

  return transcriptLines.join("\n");
}
