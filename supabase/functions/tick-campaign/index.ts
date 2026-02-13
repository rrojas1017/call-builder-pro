import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function shouldIncludeFplTable(useCase: string | null | undefined): boolean {
  if (!useCase) return false;
  const lower = useCase.toLowerCase();
  return ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment']
    .some(kw => lower.includes(kw));
}

function buildTaskPrompt(spec: any): string {
  const discl = spec.disclosure_text || "This call may be recorded for quality and compliance purposes.";
  const fields = spec.must_collect_fields || ["consent", "state", "age", "household_size", "income_est_annual", "coverage_type"];
  const transferNum = spec.transfer_phone_number || "";
  const fieldLabels: Record<string, string> = {
    consent: "Confirm they requested information and obtain verbal consent",
    state: "What state do you live in?",
    age: "How old are you?",
    household_size: "How many people are in your household?",
    income_est_annual: "What is your estimated annual household income?",
    coverage_type: "Do you currently have health insurance? (uninsured, private, employer, Medicare, Medicaid)",
  };

  let prompt = `You are a professional ACA pre-qualification screening agent.

DISCLOSURE (read verbatim): "${discl}"

RULES:
- Obtain verbal consent before screening questions
- NEVER give insurance advice. Say: "A licensed agent can explain after transfer."
- Tone: ${spec.tone_style || "Friendly, professional"}

QUESTIONS:
${(fields as string[]).map((f: string, i: number) => `${i + 1}. ${fieldLabels[f] || f}`).join("\n")}
`;

  if (shouldIncludeFplTable(spec.use_case)) {
    prompt += `
FEDERAL POVERTY LEVEL THRESHOLDS (2025):
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

SPECIAL ENROLLMENT PERIOD (SEP) RULES (Updated 2025):
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

ADDITIONAL SCREENING QUESTION:
- Have you recently experienced any life changes such as losing health coverage, getting married, having a baby, or moving to a new area?

`;
  }

  prompt += `
QUALIFICATION:
- ESI or Medicare → disqualify
- Medicaid → tag, no transfer
- Uninsured/private + income within 100-400% FPL${shouldIncludeFplTable(spec.use_case) ? ' (use table above)' : ''} → qualified, transfer
- ENROLLMENT TIMING: If outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a QLE to enroll. No QLE = inform of next Open Enrollment. Do NOT qualify based on income alone.
${transferNum ? `- Transfer to: ${transferNum}` : ""}

After call, provide JSON: consent, state, age, household_size, income_est_annual, coverage_type, qualifying_life_event, qualified, disqual_reason, transfer_attempted, transfer_completed`;

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

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", campaign.project_id)
      .single();
    if (specErr) throw specErr;

    // Count currently calling
    const { count: callingCount } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "calling");

    const available = campaign.max_concurrent_calls - (callingCount || 0);
    if (available <= 0) {
      return new Response(JSON.stringify({ message: "Max concurrent calls reached" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get next queued contacts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(available);

    if (!contacts || contacts.length === 0) {
      // No more contacts, check if all done
      const { count: remaining } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .in("status", ["queued", "calling"]);
      
      if ((remaining || 0) === 0) {
        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign_id);
      }
      return new Response(JSON.stringify({ message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;
    const task = buildTaskPrompt(spec);
    const results = [];

    for (const contact of contacts) {
      try {
        const payload: any = {
          phone_number: contact.phone,
          task,
          first_sentence: `Hi ${contact.name}, this is a quick call about health coverage options you requested information about. Do you have a moment?`,
          record: true,
          webhook: webhookUrl,
          metadata: {
            org_id: campaign.agent_projects.org_id,
            project_id: campaign.project_id,
            campaign_id: campaign_id,
            contact_id: contact.id,
            version: spec.version,
          },
          summary_prompt: "Return JSON with: consent (bool), state, age (int), household_size (int), income_est_annual (int), coverage_type, qualified (bool), disqual_reason, transfer_attempted (bool), transfer_completed (bool)",
        };

        if (spec.transfer_phone_number) {
          payload.transfer_phone_number = spec.transfer_phone_number;
        }
        if (spec.from_number) {
          payload.from = spec.from_number;
        }

        const blandResp = await fetch("https://us.api.bland.ai/v1/calls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": BLAND_API_KEY,
          },
          body: JSON.stringify(payload),
        });

        const blandData = await blandResp.json();
        if (!blandResp.ok) {
          throw new Error(`Bland API error [${blandResp.status}]: ${JSON.stringify(blandData)}`);
        }

        // Update contact
        await supabase.from("contacts").update({
          status: "calling",
          attempts: contact.attempts + 1,
          bland_call_id: blandData.call_id,
          called_at: new Date().toISOString(),
        }).eq("id", contact.id);

        results.push({ contact_id: contact.id, bland_call_id: blandData.call_id, success: true });
      } catch (err) {
        console.error(`Error calling ${contact.phone}:`, err);
        await supabase.from("contacts").update({
          status: "failed",
          attempts: contact.attempts + 1,
          last_error: err.message,
        }).eq("id", contact.id);
        results.push({ contact_id: contact.id, success: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tick-campaign error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
