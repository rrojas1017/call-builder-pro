import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEALTH_KEYWORDS = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment'];

function isHealthAgent(useCase: string | null | undefined): boolean {
  if (!useCase) return false;
  const lower = useCase.toLowerCase();
  return HEALTH_KEYWORDS.some(kw => lower.includes(kw));
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

/** Compact FPL + SEP rules */
function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2025): Income must be 100-400% of Federal Poverty Level. Reference: Single=$14.6k-$58.3k; Family of 4=$30k-$120k. Add $5.1k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

/** Condense humanization notes into a single style paragraph */
function buildCompactStyle(notes: string[]): string {
  if (!notes.length) return "Be naturally warm and conversational.";
  const condensed = notes.slice(0, 10).map(n => {
    const clean = n.replace(/^\d+\.\s*/, "").trim();
    return clean.length > 80 ? clean.substring(0, 77) + "..." : clean;
  });
  return condensed.join(". ") + ".";
}

function buildTaskPrompt(spec: any, globalTechniques: string[]): string {
  const discl = spec.disclosure_text || "This call may be recorded for quality and compliance purposes.";
  const fields = spec.must_collect_fields || ["consent", "state", "zip_code", "age", "household_size", "income_est_annual", "coverage_type"];
  const transferNum = spec.transfer_phone_number || "";
  const tone = spec.tone_style || "Friendly, professional";

  // Build compact style from global techniques
  const styleGuide = buildCompactStyle(globalTechniques);

  const fieldLabels: Record<string, string> = {
    consent: "Obtain verbal consent for screening",
    state: "What state do you live in?",
    zip_code: "Zip code? (must be 5 digits)",
    age: "How old are you?",
    household_size: "How many in your household?",
    income_est_annual: "Estimated annual household income?",
    coverage_type: "Current health insurance? (uninsured, private, employer, Medicare, Medicaid)",
  };

  let prompt = `You are a REAL PERSON on a phone call — not AI, not a robot.

INTERACTION STYLE: ${styleGuide}

DISCLOSURE (read verbatim): "${discl}"

RULES:
- Obtain verbal consent before screening. Tone: ${tone}.
- NEVER give insurance advice. Say: "A licensed agent can explain after transfer."
- Sound natural, acknowledge answers, use caller's name occasionally.

COLLECT (in order):
${(fields as string[]).map((f: string, i: number) => `${i + 1}. ${fieldLabels[f] || f}`).join("\n")}`;

  if (isHealthAgent(spec.use_case)) {
    prompt += `\n\n${buildCompactFplSep()}`;
  }

  prompt += `\n\nQUALIFICATION:
- If qualified: "That sounds really promising -- let me connect you now."
- TRANSFER RULE: ONE short sentence before transferring.
${transferNum ? `- Transfer to: ${transferNum}` : ""}

SUMMARY: After call, JSON with: consent, state, zip_code, age, household_size, income_est_annual, coverage_type, qualifying_life_event, qualified, disqual_reason, transfer_attempted, transfer_completed`;

  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");

    const BLAND_API_KEY = Deno.env.get("BLAND_API_KEY");
    if (!BLAND_API_KEY) throw new Error("BLAND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*, agent_projects!inner(id, org_id)")
      .eq("id", campaign_id)
      .single();
    if (campErr) throw campErr;
    if (campaign.status !== "running") {
      return new Response(JSON.stringify({ message: "Campaign not running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check org credit balance
    const orgId = campaign.agent_projects.org_id;
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", orgId).single();
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", campaign.project_id).single();
    if (specErr) throw specErr;

    // Get ALL queued contacts
    const { data: contacts } = await supabase
      .from("contacts").select("*")
      .eq("campaign_id", campaign_id).eq("status", "queued")
      .order("created_at", { ascending: true });

    if (!contacts || contacts.length === 0) {
      const { count: remaining } = await supabase
        .from("contacts").select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id).in("status", ["queued", "calling"]);
      if ((remaining || 0) === 0) {
        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign_id);
      }
      return new Response(JSON.stringify({ message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Summarize agent knowledge via AI
    let knowledgeBriefing = "";
    try {
      const { data: summaryData, error: summaryErr } = await supabase.functions.invoke("summarize-agent-knowledge", {
        body: { project_id: campaign.project_id },
      });
      if (summaryErr) {
        console.error("Knowledge summarization error:", summaryErr);
      } else if (summaryData?.briefing) {
        knowledgeBriefing = summaryData.briefing;
        console.log(`Campaign knowledge briefing: ${summaryData.entries_count} entries → ${knowledgeBriefing.length} chars`);
      }
    } catch (sumErr: any) {
      console.error("Failed to invoke summarize-agent-knowledge:", sumErr.message);
    }

    // Load global human behaviors (limit 10)
    const { data: globalBehaviors } = await supabase
      .from("global_human_behaviors").select("content")
      .order("created_at", { ascending: false }).limit(10);

    const globalTechniques = (globalBehaviors || []).map((g: any) => g.content as string);

    // Build compact task prompt with knowledge briefing
    let task = buildTaskPrompt(spec, globalTechniques);
    if (knowledgeBriefing) {
      task += `\n\nKNOWLEDGE BRIEFING:\n${knowledgeBriefing}`;
    }

    const MAX_TASK_LENGTH = 28000;
    if (task.length > MAX_TASK_LENGTH) {
      console.warn(`Campaign prompt too long (${task.length} chars), truncating`);
      task = task.substring(0, MAX_TASK_LENGTH) + "\n\n[Trimmed for length]";
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;
    const voiceProvider = spec.voice_provider || "bland";

    if (voiceProvider === "retell") {
      // ===== RETELL AI BRANCH =====
      const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
      if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");
      const retellAgentId = spec.retell_agent_id;
      if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
      const retellWebhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

      const callIds: string[] = [];
      for (const contact of contacts) {
        try {
          const retellPayload: any = {
            agent_id: retellAgentId,
            phone_number: contact.phone,
            metadata: {
              org_id: campaign.agent_projects.org_id,
              project_id: campaign.project_id,
              campaign_id, contact_id: contact.id,
              version: spec.version,
            },
            webhook_url: retellWebhookUrl,
          };
          if (spec.from_number) retellPayload.from_number = spec.from_number;

          const retellResp = await fetch("https://api.retellai.com/v2/create-phone-call", {
            method: "POST",
            headers: { Authorization: `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(retellPayload),
          });
          const retellData = await retellResp.json();
          console.log("Retell API response:", retellResp.status, JSON.stringify(retellData));

          if (retellData.call_id) {
            callIds.push(retellData.call_id);
            await supabase.from("contacts").update({
              status: "calling", attempts: 1, called_at: new Date().toISOString(),
            }).eq("id", contact.id);
          } else {
            await supabase.from("contacts").update({
              status: "failed", last_error: retellData.message || JSON.stringify(retellData),
            }).eq("id", contact.id);
          }
        } catch (callErr: any) {
          console.error("Retell call error:", callErr);
          await supabase.from("contacts").update({
            status: "failed", last_error: callErr.message,
          }).eq("id", contact.id);
        }
      }

      return new Response(JSON.stringify({
        provider: "retell", calls_initiated: callIds.length, contacts_dispatched: contacts.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // ===== BLAND AI BRANCH =====
      const callObjects = contacts.map((contact: any) => ({
        phone_number: contact.phone,
        first_sentence: replaceTemplateVars(
          spec.opening_line || "Hey {{first_name}}, you got a quick minute? I'm calling about the health coverage thing you looked at.",
          contact
        ),
        metadata: {
          org_id: campaign.agent_projects.org_id,
          project_id: campaign.project_id,
          campaign_id, contact_id: contact.id,
          version: spec.version,
        },
      }));

      const globalSettings: any = {
        task, record: true, webhook: webhookUrl,
        summary_prompt: "Return JSON with: consent (bool), caller_name, state, age (int), household_size (int), income_est_annual (int), coverage_type, qualified (bool), disqual_reason, transfer_attempted (bool), transfer_completed (bool)",
        model: "base", language: spec.language || "en",
      };

      if (spec.voice_id) globalSettings.voice_id = spec.voice_id;
      if (spec.transfer_phone_number) globalSettings.transfer_phone_number = spec.transfer_phone_number;
      if (spec.from_number) globalSettings.from = spec.from_number;
      if (spec.background_track && spec.background_track !== "none") globalSettings.background_track = spec.background_track;

      const blandResp = await fetch("https://api.bland.ai/v2/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify({ global: globalSettings, call_objects: callObjects }),
      });

      const blandData = await blandResp.json();
      if (!blandResp.ok) throw new Error(`Bland Batch API error [${blandResp.status}]: ${JSON.stringify(blandData)}`);

      const batchId = blandData.batch_id || blandData.id;
      await supabase.from("campaigns").update({ bland_batch_id: batchId }).eq("id", campaign_id);

      const contactIds = contacts.map((c: any) => c.id);
      await supabase.from("contacts").update({
        status: "calling", attempts: 1, called_at: new Date().toISOString(),
      }).in("id", contactIds);

      return new Response(JSON.stringify({
        batch_id: batchId, contacts_dispatched: contacts.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("tick-campaign error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
