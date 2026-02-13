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

// --- Compact prompt helpers ---

const HEALTH_KEYWORDS = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment'];

function isHealthAgent(spec: AgentSpec): boolean {
  const uc = (spec.use_case || spec.mode || "").toLowerCase();
  return HEALTH_KEYWORDS.some(kw => uc.includes(kw));
}

/** Compact FPL + SEP rules (~800 chars instead of ~3,000) */
function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2025): Income must be 100-400% of Federal Poverty Level. Reference: Single=$14.6k-$58.3k; Family of 4=$30k-$120k. Add $5.1k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

/** Compress knowledge entries: group by category, truncate, limit */
function buildCompactKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";
  const grouped: Record<string, string[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    if (grouped[e.category].length >= 4) continue; // max 4 per category
    const text = e.content.length > 150 ? e.content.substring(0, 147) + "..." : e.content;
    grouped[e.category].push(text);
  }
  const labels: Record<string, string> = {
    product_knowledge: "PRODUCT KNOWLEDGE",
    objection_handling: "OBJECTION HANDLING",
    industry_insight: "INDUSTRY INSIGHTS",
    competitor_info: "COMPETITOR AWARENESS",
  };
  const parts: string[] = [];
  for (const [cat, items] of Object.entries(grouped)) {
    const label = labels[cat] || cat.toUpperCase();
    parts.push(`${label}: ${items.join(". ")}`);
  }
  return parts.join("\n");
}

/** Condense humanization notes into a single style paragraph */
function buildCompactStyle(notes: string[]): string {
  if (!notes.length) return "Be naturally warm and conversational.";
  // Take up to 10, extract key phrases, join as a single directive
  const condensed = notes.slice(0, 10).map(n => {
    // Strip numbering if present
    const clean = n.replace(/^\d+\.\s*/, "").trim();
    return clean.length > 80 ? clean.substring(0, 77) + "..." : clean;
  });
  return condensed.join(". ") + ".";
}

function buildTaskPrompt(spec: AgentSpec, knowledge: KnowledgeEntry[]): string {
  const purpose = spec.use_case || spec.success_definition || "Conduct a professional outbound call.";
  const discl = spec.disclosure_text || "";
  const tone = spec.tone_style || "Friendly, professional, empathetic";
  const transferNum = spec.transfer_phone_number || "";
  const transferDigits = transferNum.replace(/\D/g, "");

  // Build compact humanization style
  const humanNotes = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
  const styleGuide = buildCompactStyle(humanNotes);

  // Parse fields
  const rawFields = spec.must_collect_fields;
  let fields: string[] = [];
  if (Array.isArray(rawFields)) {
    fields = rawFields;
  } else if (typeof rawFields === "string") {
    try { const p = JSON.parse(rawFields); if (Array.isArray(p)) fields = p; } catch { /* skip */ }
  }

  // Inject name confirmation after consent if not already present
  if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('confirm') && f.toLowerCase().includes('name'))) {
    const consentIdx = fields.findIndex((f: string) => f.toLowerCase().includes('consent'));
    if (consentIdx >= 0) {
      fields.splice(consentIdx + 1, 0, "Can I confirm your full name?");
    } else {
      fields.unshift("Can I confirm your full name?");
    }
  }

  const qualRules = spec.qualification_rules
    ? (typeof spec.qualification_rules === "string" ? spec.qualification_rules : JSON.stringify(spec.qualification_rules, null, 2))
    : null;
  const disqualRules = spec.disqualification_rules
    ? (typeof spec.disqualification_rules === "string" ? spec.disqualification_rules : JSON.stringify(spec.disqualification_rules, null, 2))
    : null;

  let prompt = `You are a REAL PERSON on a phone call — not AI, not a robot.

INTERACTION STYLE: ${styleGuide}

PURPOSE: ${purpose}

RULES:
- Tone: ${tone}
- Sound natural: vary sentence length, react genuinely, use casual transitions ("Gotcha", "Makes sense").
- Use caller's name occasionally. Acknowledge each answer before the next question.
- Never guess or assume answers.`;

  // Domain knowledge (compact)
  const knowledgeSection = buildCompactKnowledge(knowledge);
  if (knowledgeSection) {
    prompt += `\n\nDOMAIN KNOWLEDGE:\n${knowledgeSection}`;
  }

  if (discl) {
    prompt += `\n\nDISCLOSURE (read at start): "${discl}"`;
  }

  if (fields.length > 0) {
    prompt += `\n\nCOLLECT (in order):\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    prompt += `\nZIP: Must be exactly 5 digits.`;
  }

  // Health-specific compact rules
  if (isHealthAgent(spec)) {
    prompt += `\n\n${buildCompactFplSep()}`;
    if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('life event') || f.toLowerCase().includes('qle'))) {
      prompt += `\nASK: "Have you recently had any life changes like losing coverage, marriage, baby, or moving?"`;
    }
  }

  if (qualRules) prompt += `\n\nQUALIFICATION:\n${qualRules}`;
  if (disqualRules) prompt += `\n\nDISQUALIFICATION:\n${disqualRules}`;

  if (transferDigits.length >= 10) {
    const formatted = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If qualified, say ONE short sentence then transfer to ${formatted}.`;
  }

  prompt += `\n\nFALLBACK: After 2 failed attempts to collect info, end politely.`;
  prompt += `\nSUMMARY: After call, JSON with all collected fields + caller_name.`;

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

    // Check org credit balance
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", testRun.org_id).single();
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Load agent knowledge (capped to 10)
    const { data: knowledgeRows } = await supabase
      .from("agent_knowledge").select("category, content")
      .eq("project_id", testRun.project_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const knowledge: KnowledgeEntry[] = (knowledgeRows || []) as KnowledgeEntry[];

    // Load global human behaviors (limit 10)
    const { data: globalBehaviors } = await supabase
      .from("global_human_behaviors").select("content")
      .order("created_at", { ascending: false })
      .limit(10);

    const globalTechniques = (globalBehaviors || []).map((g: any) => g.content as string);

    // Merge global behaviors into spec's humanization_notes (deduped)
    if (spec && globalTechniques.length > 0) {
      const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
      const existingLower = new Set(currentNotes.map((n: string) => n.toLowerCase().trim()));
      const newGlobal = globalTechniques.filter((t: string) => !existingLower.has(t.toLowerCase().trim()));
      spec.humanization_notes = [...currentNotes, ...newGlobal];
    }

    const voiceProvider = spec?.voice_provider || "bland";
    let baseTask = testRun.agent_instructions_text || (spec ? buildTaskPrompt(spec, knowledge) : "Conduct a professional outbound call.");

    // Smart guard: progressively trim if over limit
    const MAX_TASK_LENGTH = 28000;
    if (baseTask.length > MAX_TASK_LENGTH) {
      console.warn(`Prompt too long (${baseTask.length} chars), truncating to ${MAX_TASK_LENGTH}`);
      baseTask = baseTask.substring(0, MAX_TASK_LENGTH) + "\n\n[Trimmed for length]";
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
              test_run_id, test_run_contact_id: contact.id,
              org_id: testRun.org_id, project_id: testRun.project_id,
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
      // ===== BLAND AI BRANCH =====
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
              test_run_id, test_run_contact_id: contact.id,
              org_id: testRun.org_id, project_id: testRun.project_id,
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
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
