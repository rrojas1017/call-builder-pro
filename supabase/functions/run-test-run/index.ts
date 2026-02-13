import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentSpec {
  disclosure_text?: string | null;
  consent_required?: boolean;
  must_collect_fields?: string[] | null;
  qualification_rules?: Record<string, any> | null;
  disqualification_rules?: Record<string, any> | null;
  transfer_phone_number?: string | null;
  tone_style?: string | null;
  language?: string | null;
  opening_line?: string | null;
  transfer_required?: boolean | null;
  mode?: string | null;
  use_case?: string | null;
  success_definition?: string | null;
  humanization_notes?: string[];
}

interface KnowledgeEntry {
  category: string;
  content: string;
}

function buildKnowledgeSection(entries: KnowledgeEntry[]): string {
  const grouped: Record<string, string[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e.content);
  }

  const sections: string[] = [];

  if (grouped.product_knowledge?.length) {
    sections.push(`PRODUCT & INDUSTRY KNOWLEDGE:\n${grouped.product_knowledge.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
  }
  if (grouped.objection_handling?.length) {
    sections.push(`OBJECTION HANDLING:\n${grouped.objection_handling.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
  }
  if (grouped.industry_insight?.length) {
    sections.push(`INDUSTRY INSIGHTS:\n${grouped.industry_insight.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
  }
  if (grouped.competitor_info?.length) {
    sections.push(`COMPETITOR AWARENESS:\n${grouped.competitor_info.map((c, i) => `${i + 1}. ${c}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

function buildTaskPrompt(spec: AgentSpec, knowledge: KnowledgeEntry[]): string {
  const purpose = spec.use_case || spec.success_definition || "Conduct a professional outbound call.";
  const discl = spec.disclosure_text || "";
  const tone = spec.tone_style || "Friendly, professional, empathetic";

  const humanNotes = Array.isArray(spec.humanization_notes) && spec.humanization_notes.length > 0
    ? spec.humanization_notes.map((n: string, i: number) => `${i + 1}. ${n}`).join("\n")
    : "No learned techniques yet -- be naturally warm and conversational.";

  const rawFields = spec.must_collect_fields;
  let fields: string[] = [];
  if (Array.isArray(rawFields)) {
    fields = rawFields;
  } else if (typeof rawFields === "string") {
    try { const p = JSON.parse(rawFields); if (Array.isArray(p)) fields = p; } catch { /* skip */ }
  }

  const qualRules = spec.qualification_rules
    ? (typeof spec.qualification_rules === "string" ? spec.qualification_rules : JSON.stringify(spec.qualification_rules, null, 2))
    : null;
  const disqualRules = spec.disqualification_rules
    ? (typeof spec.disqualification_rules === "string" ? spec.disqualification_rules : JSON.stringify(spec.disqualification_rules, null, 2))
    : null;

  const transferNum = spec.transfer_phone_number || "";
  const transferDigits = transferNum.replace(/\D/g, "");

  let prompt = `You are a REAL PERSON making a phone call -- not an AI, not a robot, not a script-reader.

HUMAN CONVERSATION STYLE (THIS IS YOUR #1 PRIORITY):
- You are having a natural phone conversation. Sound like someone they'd enjoy talking to at a coffee shop.
- React genuinely to what they say: laugh lightly at something funny, show empathy for difficulties, express enthusiasm for good news.
- Use casual transitions: "Oh that's great!", "Gotcha", "Makes sense", "Ha, yeah I hear that a lot"
- Add brief, relevant small talk between questions: "Nice, [state] is beautiful this time of year" or "Oh wow, that's a big family -- I bet holidays are fun"
- Vary your sentence length and rhythm. Mix short reactions ("Got it!") with longer explanations.
- Never ask questions back-to-back like a survey. Acknowledge each answer before moving on.
- If you need to transition topics, use natural bridges: "So switching gears a little..." or "That actually reminds me, I also wanted to ask..."
- Use light humor when appropriate -- nothing forced, just natural warmth.
- Use the caller's name naturally (not every sentence).

LEARNED CONVERSATION TECHNIQUES:
${humanNotes}

PURPOSE: ${purpose}

RULES:
- Tone: ${tone}
- Never guess or assume answers the caller hasn't given.`;

  // Inject domain knowledge from agent_knowledge table
  const knowledgeSection = buildKnowledgeSection(knowledge);
  if (knowledgeSection) {
    prompt += `\n\nDOMAIN KNOWLEDGE (use this to answer questions knowledgeably):\n${knowledgeSection}`;
  }

  if (discl) {
    prompt += `\n\nDISCLOSURE (read at the start of the call):\n"${discl}"`;
  }

  if (fields.length > 0) {
    prompt += `\n\nINFORMATION TO COLLECT (in this order):\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
  }

  if (qualRules) {
    prompt += `\n\nQUALIFICATION CRITERIA:\n${qualRules}`;
  }
  if (disqualRules) {
    prompt += `\n\nDISQUALIFICATION CRITERIA:\n${disqualRules}`;
  }

  if (transferDigits.length >= 10) {
    const formattedNum = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If the caller qualifies, transfer them to ${formattedNum}.`;
  }

  prompt += `\n\nFALLBACK: If you cannot collect required information after 2 attempts, note what's missing and end politely.`;
  prompt += `\n\nSUMMARY: After the call, provide a JSON summary with all collected fields.`;

  return prompt;
}

function replaceTemplateVars(text: string, contact: { name: string; phone: string }): string {
  const parts = (contact.name || "").trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return text
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{last_name\}\}/gi, lastName)
    .replace(/\{\{name\}\}/gi, contact.name || "")
    .replace(/\{\{phone\}\}/gi, contact.phone || "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { test_run_id } = await req.json();
    if (!test_run_id) throw new Error("test_run_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const blandApiKey = Deno.env.get("BLAND_API_KEY");
    if (!blandApiKey) throw new Error("BLAND_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load test run
    const { data: testRun, error: trErr } = await supabase
      .from("test_runs").select("*").eq("id", test_run_id).single();
    if (trErr) throw trErr;

    // Check concurrency
    const { data: callingContacts } = await supabase
      .from("test_run_contacts").select("id").eq("test_run_id", test_run_id).eq("status", "calling");

    const slotsAvailable = testRun.concurrency - (callingContacts?.length || 0);
    if (slotsAvailable <= 0) {
      return new Response(JSON.stringify({ initiated_count: 0, message: "All slots busy" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get queued contacts
    const { data: queuedContacts, error: qErr } = await supabase
      .from("test_run_contacts").select("*")
      .eq("test_run_id", test_run_id).eq("status", "queued")
      .order("created_at", { ascending: true }).limit(slotsAvailable);
    if (qErr) throw qErr;

    if (!queuedContacts?.length) {
      const { data: remaining } = await supabase
        .from("test_run_contacts").select("id")
        .eq("test_run_id", test_run_id).in("status", ["queued", "calling"]);

      if (!remaining?.length) {
        await supabase.from("test_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", test_run_id);
      }

      return new Response(JSON.stringify({ initiated_count: 0, message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load agent spec
    const { data: spec } = await supabase
      .from("agent_specs").select("*").eq("project_id", testRun.project_id).single();

    // Load agent knowledge
    const { data: knowledgeRows } = await supabase
      .from("agent_knowledge").select("category, content")
      .eq("project_id", testRun.project_id);

    const knowledge: KnowledgeEntry[] = (knowledgeRows || []) as KnowledgeEntry[];

    const baseTask = testRun.agent_instructions_text || (spec ? buildTaskPrompt(spec, knowledge) : "Conduct a professional outbound call.");
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;

    const callIds: string[] = [];

    for (const contact of queuedContacts) {
      try {
        const contactTask = replaceTemplateVars(baseTask, contact);
        const contactFirstSentence = spec?.opening_line ? replaceTemplateVars(spec.opening_line, contact) : undefined;

        const blandPayload: any = {
          phone_number: contact.phone,
          task: contactTask,
          first_sentence: contactFirstSentence,
          voice: spec?.voice_id || "maya",
          model: "base",
          record: true,
          webhook: webhookUrl,
          temperature: spec?.temperature ?? 0.7,
          interruption_threshold: spec?.interruption_threshold ?? 100,
          noise_cancellation: true,
          metadata: {
            test_run_id,
            test_run_contact_id: contact.id,
            org_id: testRun.org_id,
            project_id: testRun.project_id,
            spec_version: testRun.spec_version,
          },
        };

        if (spec?.speaking_speed && spec.speaking_speed !== 1.0) {
          blandPayload.voice_settings = { speed: spec.speaking_speed };
        }
        if (spec?.pronunciation_guide && Array.isArray(spec.pronunciation_guide) && spec.pronunciation_guide.length > 0) {
          blandPayload.pronunciation_guide = spec.pronunciation_guide;
        }
        if (spec?.transfer_required && spec?.transfer_phone_number) {
          const digits = spec.transfer_phone_number.replace(/\D/g, "");
          if (digits.length >= 10) {
            blandPayload.transfer_phone_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
          }
        }

        const blandResp = await fetch("https://api.bland.ai/v1/calls", {
          method: "POST",
          headers: { Authorization: blandApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(blandPayload),
        });

        const blandData = await blandResp.json();
        console.log("Bland API response:", blandResp.status, JSON.stringify(blandData));

        if (blandData.call_id) {
          callIds.push(blandData.call_id);
          await supabase.from("test_run_contacts").update({
            status: "calling", bland_call_id: blandData.call_id, called_at: new Date().toISOString(),
          }).eq("id", contact.id);
        } else {
          await supabase.from("test_run_contacts").update({
            status: "failed", error: blandData.message || blandData.error || JSON.stringify(blandData),
          }).eq("id", contact.id);
        }
      } catch (callErr: any) {
        await supabase.from("test_run_contacts").update({ status: "failed", error: callErr.message }).eq("id", contact.id);
      }
    }

    if (testRun.status === "draft") {
      await supabase.from("test_runs").update({ status: "running" }).eq("id", test_run_id);
    }

    return new Response(JSON.stringify({ initiated_count: callIds.length, call_ids: callIds }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("run-test-run error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
