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

  // Inject name confirmation after consent if not already present
  if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('confirm') && f.toLowerCase().includes('name'))) {
    const consentIdx = fields.findIndex((f: string) => f.toLowerCase().includes('consent'));
    if (consentIdx >= 0) {
      fields.splice(consentIdx + 1, 0, "And just so I have it right, can I confirm your full name?");
    } else {
      fields.unshift("And just so I have it right, can I confirm your full name?");
    }
  }

  if (fields.length > 0) {
    prompt += `\n\nINFORMATION TO COLLECT (in this order):\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    prompt += `\n\nZIP CODE VALIDATION: When collecting zip code, confirm it is exactly 5 digits. If the caller gives fewer or more digits, ask them to double-check.`;
  }

  const useCase = spec.use_case || spec.mode || "";
  const isHealthAgent = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment']
    .some(kw => useCase.toLowerCase().includes(kw));

  if (isHealthAgent) {
    prompt += `\n\nFEDERAL POVERTY LEVEL THRESHOLDS (2025):
Qualification Range: 100-400% of Federal Poverty Level

Household Size | 100% FPL  | 400% FPL
1              | $14,580   | $58,320
2              | $19,720   | $78,880
3              | $24,860   | $99,440
4              | $30,000   | $120,000
5              | $35,140   | $140,560
6              | $40,280   | $161,120
7              | $45,420   | $181,680
8+             | $50,560+  | $202,240+
(Add $5,140 per additional person beyond 8 for 100% FPL; multiply by 4 for 400% FPL)

Use this table to determine qualification: If the caller's annual household income falls between the 100% and 400% FPL amounts for their household size, they may qualify for ACA marketplace assistance.`;

    prompt += `\n\nSPECIAL ENROLLMENT PERIOD (SEP) RULES (Updated 2025):
IMPORTANT: The low-income SEP (income ≤150% FPL) was ELIMINATED as of August 25, 2025.
Income alone does NOT qualify someone for year-round enrollment.

Outside of Open Enrollment (Nov 1 - Dec 15), callers can ONLY enroll if they have
a Qualifying Life Event (QLE) within the past 60 days:
1. Involuntary loss of health coverage (job loss, aging off parent's plan, losing Medicaid)
2. Marriage
3. Birth, adoption, or placement of a child in foster care
4. Permanent move to a new coverage area (must have had prior coverage)
5. Becoming a U.S. citizen or gaining lawful presence
6. Divorce (if it results in loss of coverage)
7. Gaining access to a QSEHRA or Individual Coverage HRA from employer
8. Employer-sponsored plan becoming unaffordable (>9.96% of household income)
9. Change in income that affects subsidy eligibility
10. Leaving the Medicaid coverage gap due to income increase
11. Exceptional circumstances (natural disaster, enrollment errors)

If outside Open Enrollment:
- Ask if the caller has experienced any of these life events in the past 60 days
- If YES: they may qualify for a SEP regardless of income (still must meet FPL range)
- If NO: inform them they can enroll during the next Open Enrollment period
- Do NOT tell them they qualify for a SEP based on income alone`;

    // Add QLE screening question for health agents
    if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('life event') || f.toLowerCase().includes('qle'))) {
      prompt += `\n\nADDITIONAL SCREENING QUESTION:
- Have you recently experienced any life changes such as losing health coverage, getting married, having a baby, or moving to a new area? (This determines enrollment eligibility outside Open Enrollment)`;
    }

    // Updated qualification logic with SEP awareness
    prompt += `\n\nENROLLMENT TIMING RULES:
- If currently outside Open Enrollment (Nov 1 - Dec 15), the caller MUST have a Qualifying Life Event (QLE) to enroll.
- If they have no QLE, inform them of the next Open Enrollment period.
- Do NOT tell them they qualify for a SEP based on income alone.`;
  }

  if (qualRules) {
    prompt += `\n\nQUALIFICATION CRITERIA:\n${qualRules}`;
  }
  if (disqualRules) {
    prompt += `\n\nDISQUALIFICATION CRITERIA:\n${disqualRules}`;
  }

  if (transferDigits.length >= 10) {
    const formattedNum = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If the caller qualifies, say briefly: "That sounds really promising -- let me connect you now." Then transfer to ${formattedNum}. Keep it to ONE short sentence before transferring.`;
  }

  prompt += `\n\nFALLBACK: If you cannot collect required information after 2 attempts, note what's missing and end politely.`;
  prompt += `\n\nSUMMARY: After the call, provide a JSON summary with all collected fields including caller_name.`;

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

    // Check org credit balance before placing calls
    const { data: orgData } = await supabase
      .from("organizations")
      .select("credits_balance")
      .eq("id", testRun.org_id)
      .single();
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Cap knowledge to prevent oversized prompts
    const knowledge: KnowledgeEntry[] = (knowledgeRows || []).slice(0, 20) as KnowledgeEntry[];

    // Load global human behaviors
    const { data: globalBehaviors } = await supabase
      .from("global_human_behaviors").select("content")
      .order("created_at", { ascending: true });

    // Limit global behaviors to most recent 15
    const globalTechniques = (globalBehaviors || []).slice(-15).map((g: any) => g.content as string);

    // Merge global behaviors into spec's humanization_notes (deduped)
    if (spec && globalTechniques.length > 0) {
      const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
      const existingLower = new Set(currentNotes.map((n: string) => n.toLowerCase().trim()));
      const newGlobal = globalTechniques.filter((t: string) => !existingLower.has(t.toLowerCase().trim()));
      spec.humanization_notes = [...currentNotes, ...newGlobal];
    }

    const voiceProvider = spec?.voice_provider || "bland";
    let baseTask = testRun.agent_instructions_text || (spec ? buildTaskPrompt(spec, knowledge) : "Conduct a professional outbound call.");

    // Ensure prompt stays under Bland's 30k char limit
    const MAX_TASK_LENGTH = 29000;
    if (baseTask.length > MAX_TASK_LENGTH) {
      baseTask = baseTask.substring(0, MAX_TASK_LENGTH) + "\n\n[Prompt truncated for length]";
    }

    const callIds: string[] = [];

    if (voiceProvider === "retell") {
      // ===== RETELL AI BRANCH =====
      const retellApiKey = Deno.env.get("RETELL_API_KEY");
      if (!retellApiKey) throw new Error("RETELL_API_KEY not configured");
      const retellAgentId = spec?.retell_agent_id;
      if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
      const retellWebhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

      for (const contact of queuedContacts) {
        try {
          const retellPayload: any = {
            agent_id: retellAgentId,
            phone_number: contact.phone,
            metadata: {
              test_run_id,
              test_run_contact_id: contact.id,
              org_id: testRun.org_id,
              project_id: testRun.project_id,
              spec_version: testRun.spec_version,
            },
            webhook_url: retellWebhookUrl,
          };

          if (spec?.from_number) retellPayload.from_number = spec.from_number;

          const retellResp = await fetch("https://api.retellai.com/v2/create-phone-call", {
            method: "POST",
            headers: { Authorization: `Bearer ${retellApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(retellPayload),
          });

          const retellData = await retellResp.json();
          console.log("Retell API response:", retellResp.status, JSON.stringify(retellData));

          if (retellData.call_id) {
            callIds.push(retellData.call_id);
            await supabase.from("test_run_contacts").update({
              status: "calling", retell_call_id: retellData.call_id, called_at: new Date().toISOString(),
            } as any).eq("id", contact.id);
          } else {
            await supabase.from("test_run_contacts").update({
              status: "failed", error: retellData.message || retellData.error || JSON.stringify(retellData),
            }).eq("id", contact.id);
          }
        } catch (callErr: any) {
          await supabase.from("test_run_contacts").update({ status: "failed", error: callErr.message }).eq("id", contact.id);
        }
      }
    } else {
      // ===== EXISTING BLAND AI BRANCH (UNCHANGED) =====
      const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;

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
          if (spec?.background_track && spec.background_track !== "none") {
            blandPayload.background_track = spec.background_track;
          }

          const blandResp = await fetch("https://us.api.bland.ai/v1/calls", {
            method: "POST",
            headers: { Authorization: blandApiKey, "Content-Type": "application/json" },
            body: JSON.stringify(blandPayload),
          });

          const blandText = await blandResp.text();
          let blandData;
          try {
            blandData = JSON.parse(blandText);
          } catch {
            throw new Error(`Bland API returned non-JSON (HTTP ${blandResp.status}): ${blandText.substring(0, 200)}`);
          }
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
