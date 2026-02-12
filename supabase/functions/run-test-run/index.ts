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
}

function buildTaskPrompt(spec: AgentSpec): string {
  const discl = spec.disclosure_text || "This call may be recorded for quality and compliance purposes.";
  const fields = (spec.must_collect_fields as string[]) || ["consent", "state", "age", "household_size", "income_est_annual", "coverage_type"];
  const transferNum = spec.transfer_phone_number || "";

  const formatField = (field: string): string => {
    const labels: Record<string, string> = {
      consent: "Confirm they requested information and obtain verbal consent for screening",
      state: "What state do you live in?",
      age: "How old are you?",
      household_size: "How many people are in your household?",
      income_est_annual: "What is your estimated annual household income?",
      coverage_type: "Do you currently have health insurance? (uninsured, private, employer, Medicare, Medicaid)",
    };
    return labels[field] || field;
  };

  return `You are a professional, friendly ACA pre-qualification screening agent.

DISCLOSURE (read verbatim at the start):
"${discl}"

RULES:
- You MUST obtain verbal consent before asking any screening questions.
- If the caller declines consent, politely end the call.
- NEVER give insurance advice, plan details, or pricing.
- Keep the conversation concise and professional.
- Tone: ${spec.tone_style || "Friendly, professional, empathetic"}

SCREENING QUESTIONS (collect in this order):
${fields.map((f, i) => `${i + 1}. ${formatField(f)}`).join("\n")}

QUALIFICATION LOGIC:
- If the caller has employer-sponsored insurance or Medicare → DISQUALIFY.
- If the caller has Medicaid → Tag as Medicaid.
- If qualified, say: "Great news! Let me connect you with a licensed agent."
${transferNum ? `- Transfer to: ${transferNum}` : "- No transfer number configured."}

FALLBACK:
- If you cannot collect required information after 2 attempts, note what's missing and end politely.

SUMMARY: After the call, provide a JSON summary with collected fields.`;
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
      .from("test_runs")
      .select("*")
      .eq("id", test_run_id)
      .single();
    if (trErr) throw trErr;

    // Check how many are currently calling
    const { data: callingContacts } = await supabase
      .from("test_run_contacts")
      .select("id")
      .eq("test_run_id", test_run_id)
      .eq("status", "calling");

    const currentlyActive = callingContacts?.length || 0;
    const slotsAvailable = testRun.concurrency - currentlyActive;

    if (slotsAvailable <= 0) {
      return new Response(JSON.stringify({ initiated_count: 0, message: "All slots busy" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get queued contacts
    const { data: queuedContacts, error: qErr } = await supabase
      .from("test_run_contacts")
      .select("*")
      .eq("test_run_id", test_run_id)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);
    if (qErr) throw qErr;

    if (!queuedContacts?.length) {
      // Check if all done
      const { data: remaining } = await supabase
        .from("test_run_contacts")
        .select("id")
        .eq("test_run_id", test_run_id)
        .in("status", ["queued", "calling"]);

      if (!remaining?.length) {
        await supabase
          .from("test_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", test_run_id);
      }

      return new Response(JSON.stringify({ initiated_count: 0, message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load agent spec
    const { data: spec } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", testRun.project_id)
      .single();

    const task = testRun.agent_instructions_text || (spec ? buildTaskPrompt(spec) : "Conduct a professional screening call.");
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;

    const callIds: string[] = [];

    for (const contact of queuedContacts) {
      try {
        const blandPayload: any = {
          phone_number: contact.phone,
          task,
          first_sentence: spec?.opening_line || undefined,
          voice: spec?.voice_id || "maya",
          model: "base",
          record: true,
          webhook: webhookUrl,
          metadata: {
            test_run_id,
            test_run_contact_id: contact.id,
            org_id: testRun.org_id,
            project_id: testRun.project_id,
            spec_version: testRun.spec_version,
          },
        };

        if (spec?.transfer_required && spec?.transfer_phone_number) {
          blandPayload.transfer_phone_number = spec.transfer_phone_number;
        }

        const blandResp = await fetch("https://api.bland.ai/v1/calls", {
          method: "POST",
          headers: {
            Authorization: blandApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(blandPayload),
        });

        const blandData = await blandResp.json();
        console.log("Bland API response:", blandResp.status, JSON.stringify(blandData));

        if (blandData.call_id) {
          callIds.push(blandData.call_id);
          await supabase
            .from("test_run_contacts")
            .update({
              status: "calling",
              bland_call_id: blandData.call_id,
              called_at: new Date().toISOString(),
            })
            .eq("id", contact.id);
        } else {
          await supabase
            .from("test_run_contacts")
            .update({ status: "failed", error: blandData.message || blandData.error || JSON.stringify(blandData) })
            .eq("id", contact.id);
        }
      } catch (callErr: any) {
        await supabase
          .from("test_run_contacts")
          .update({ status: "failed", error: callErr.message })
          .eq("id", contact.id);
      }
    }

    // Update test run status
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
