import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildTaskPrompt(spec: any): string {
  const discl = spec.disclosure_text || "This call may be recorded for quality and compliance purposes.";
  const fields = spec.must_collect_fields || ["consent", "state", "zip_code", "age", "household_size", "income_est_annual", "coverage_type"];
  const transferNum = spec.transfer_phone_number || "";
  const fieldLabels: Record<string, string> = {
    consent: "Confirm they requested information and obtain verbal consent",
    state: "What state do you live in?",
    zip_code: "And what's your zip code?",
    age: "How old are you?",
    household_size: "How many people are in your household?",
    income_est_annual: "What is your estimated annual household income?",
    coverage_type: "Do you currently have health insurance? (uninsured, private, employer, Medicare, Medicaid)",
  };

  return `You are a friendly, knowledgeable health benefits advisor answering an inbound call.

DISCLOSURE (read verbatim): "${discl}"

RULES:
- Obtain verbal consent before screening questions
- NEVER give insurance advice. Say: "A licensed agent can explain after transfer."
- Tone: ${spec.tone_style || "Friendly, professional"}

QUESTIONS:
${(fields as string[]).map((f: string, i: number) => `${i + 1}. ${fieldLabels[f] || f}`).join("\n")}

QUALIFICATION:
- ESI or Medicare → disqualify
- Medicaid → tag, no transfer
- Uninsured/private + income within 100-400% FPL → qualified, transfer
${transferNum ? `- Transfer to: ${transferNum}` : ""}

After call, provide JSON: consent, state, zip_code, age, household_size, income_est_annual, coverage_type, qualified, disqual_reason, transfer_attempted, transfer_completed`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    if (!action) throw new Error("action is required");

    const BLAND_API_KEY = Deno.env.get("BLAND_API_KEY");
    if (!BLAND_API_KEY) throw new Error("BLAND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;

    // ===== PURCHASE =====
    if (action === "purchase") {
      const { area_code, org_id } = body;
      if (!area_code || !org_id) throw new Error("area_code and org_id required");

      // Purchase number from Bland
      const purchaseResp = await fetch("https://api.bland.ai/v1/inbound/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify({ area_code }),
      });
      const purchaseData = await purchaseResp.json();
      if (!purchaseResp.ok) throw new Error(`Bland purchase error: ${JSON.stringify(purchaseData)}`);

      const phoneNumber = purchaseData.phone_number || purchaseData.number;
      if (!phoneNumber) throw new Error("No phone number returned from Bland");

      // Insert into our table
      const { data: inserted, error: insertErr } = await supabase
        .from("inbound_numbers")
        .insert({ org_id, phone_number: phoneNumber, area_code, status: "active" })
        .select()
        .single();
      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ success: true, number: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== ASSIGN =====
    if (action === "assign") {
      const { number_id, project_id } = body;
      if (!number_id || !project_id) throw new Error("number_id and project_id required");

      // Get the number
      const { data: num, error: numErr } = await supabase
        .from("inbound_numbers").select("*").eq("id", number_id).single();
      if (numErr) throw numErr;

      // Get agent spec
      const { data: spec, error: specErr } = await supabase
        .from("agent_specs").select("*").eq("project_id", project_id).single();
      if (specErr) throw new Error("Agent has no spec configured");

      // Get agent project for org_id
      const { data: project } = await supabase
        .from("agent_projects").select("org_id").eq("id", project_id).single();

      // Load global behaviors
      const { data: globalBehaviors } = await supabase
        .from("global_human_behaviors").select("content").order("created_at", { ascending: true });
      const techniques = (globalBehaviors || []).map((g: any) => g.content as string);

      let task = buildTaskPrompt(spec);
      if (techniques.length > 0) {
        task += `\n\nLEARNED CONVERSATION TECHNIQUES:\n${techniques.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
      }

      // Configure on Bland
      const configBody: any = {
        prompt: task,
        webhook: webhookUrl,
        metadata: { org_id: project?.org_id || num.org_id, project_id },
      };
      if (spec.voice_id) configBody.voice_id = spec.voice_id;
      if (spec.transfer_phone_number) configBody.transfer_phone_number = spec.transfer_phone_number;
      if (spec.background_track && spec.background_track !== "none") configBody.background_track = spec.background_track;

      const configResp = await fetch(`https://api.bland.ai/v1/inbound/${encodeURIComponent(num.phone_number)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify(configBody),
      });
      if (!configResp.ok) {
        const err = await configResp.json();
        throw new Error(`Bland config error: ${JSON.stringify(err)}`);
      }

      // Update local DB
      await supabase.from("inbound_numbers").update({ project_id }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== UNASSIGN =====
    if (action === "unassign") {
      const { number_id } = body;
      if (!number_id) throw new Error("number_id required");

      const { data: num } = await supabase
        .from("inbound_numbers").select("*").eq("id", number_id).single();
      if (!num) throw new Error("Number not found");

      // Set generic prompt on Bland
      await fetch(`https://api.bland.ai/v1/inbound/${encodeURIComponent(num.phone_number)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify({
          prompt: "This number is not currently in service. Please try again later. Politely end the call.",
          metadata: { org_id: num.org_id },
        }),
      });

      await supabase.from("inbound_numbers").update({ project_id: null }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== RELEASE =====
    if (action === "release") {
      const { number_id } = body;
      if (!number_id) throw new Error("number_id required");

      await supabase.from("inbound_numbers").update({ status: "released", project_id: null }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== UPDATE LABEL =====
    if (action === "update_label") {
      const { number_id, label } = body;
      if (!number_id) throw new Error("number_id required");

      await supabase.from("inbound_numbers").update({ label }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SYNC =====
    if (action === "sync") {
      const { org_id } = body;
      if (!org_id) throw new Error("org_id required");

      const resp = await fetch("https://api.bland.ai/v1/inbound", {
        headers: { "Authorization": BLAND_API_KEY },
      });
      const data = await resp.json();
      const numbers = Array.isArray(data) ? data : data?.inbound_numbers || data?.numbers || [];

      for (const num of numbers) {
        const phone = num.phone_number || num.number;
        if (!phone) continue;
        await supabase.from("inbound_numbers").upsert(
          { org_id, phone_number: phone, status: "active" },
          { onConflict: "phone_number" }
        );
      }

      return new Response(JSON.stringify({ success: true, synced: numbers.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error("manage-inbound-numbers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
