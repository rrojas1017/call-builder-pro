import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

      const purchaseResp = await fetch("https://api.bland.ai/v1/inbound/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify({ area_code }),
      });
      const purchaseData = await purchaseResp.json();
      console.log("Bland purchase response:", JSON.stringify(purchaseData));
      if (!purchaseResp.ok) {
        const blandErrors = purchaseData?.errors || [];
        const unavailable = blandErrors.some((e: any) => e.error === "NUMBER_UNAVAILABLE_ERROR");
        if (unavailable) {
          throw new Error(`No phone numbers available for area code ${area_code}. Try a different area code (e.g. 213, 312, 786).`);
        }
        throw new Error(`Bland purchase error: ${JSON.stringify(purchaseData)}`);
      }
      const phoneNumber = purchaseData.phone_number || purchaseData.number || purchaseData.data?.phone_number || purchaseData.data?.number;
      if (!phoneNumber) throw new Error(`No phone number in Bland response: ${JSON.stringify(purchaseData)}`);

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

      const { data: num, error: numErr } = await supabase
        .from("inbound_numbers").select("*").eq("id", number_id).single();
      if (numErr) throw numErr;

      const { data: spec, error: specErr } = await supabase
        .from("agent_specs").select("*").eq("project_id", project_id).single();
      if (specErr) throw new Error("Agent has no spec configured");

      const { data: project } = await supabase
        .from("agent_projects").select("org_id").eq("id", project_id).single();

      // Summarize agent knowledge via AI (matching university/campaign pattern)
      let knowledgeBriefing = "";
      try {
        const { data: summaryData, error: summaryErr } = await supabase.functions.invoke("summarize-agent-knowledge", {
          body: { project_id },
        });
        if (summaryErr) {
          console.error("Knowledge summarization error:", summaryErr);
        } else if (summaryData?.briefing) {
          knowledgeBriefing = summaryData.briefing;
          console.log(`Inbound knowledge briefing: ${summaryData.entries_count} entries → ${knowledgeBriefing.length} chars`);
        }
      } catch (sumErr: any) {
        console.error("Failed to invoke summarize-agent-knowledge:", sumErr.message);
      }

      // Load global human behaviors and merge into spec (matching university/campaign pattern)
      const { data: globalBehaviors } = await supabase
        .from("global_human_behaviors").select("content")
        .order("created_at", { ascending: false }).limit(10);
      const globalTechniques = (globalBehaviors || []).map((g: any) => g.content as string);

      if (globalTechniques.length > 0) {
        const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
        const existingLower = new Set(currentNotes.map((n: string) => n.toLowerCase().trim()));
        const newGlobal = globalTechniques.filter((t: string) => !existingLower.has(t.toLowerCase().trim()));
        spec.humanization_notes = [...currentNotes, ...newGlobal];
      }

      // Build task using shared builder (identical to university/campaign)
      let task = buildTaskPrompt(spec, [], knowledgeBriefing);

      const MAX_TASK_LENGTH = 28000;
      if (task.length > MAX_TASK_LENGTH) {
        console.warn(`Inbound prompt too long (${task.length} chars), truncating`);
        task = task.substring(0, MAX_TASK_LENGTH) + "\n\n[Trimmed for length]";
      }

      // Configure on Bland (full parity with run-test-run / tick-campaign)
      const configBody: any = {
        prompt: task,
        webhook: webhookUrl,
        model: "base",
        voice: spec.voice_id || "maya",
        temperature: spec.temperature ?? 0.7,
        interruption_threshold: spec.interruption_threshold ?? 100,
        noise_cancellation: true,
        record: true,
        metadata: { org_id: project?.org_id || num.org_id, project_id },
      };
      if (spec.opening_line) configBody.first_sentence = spec.opening_line;
      if (spec.language) configBody.language = spec.language;
      if (spec.transfer_phone_number) configBody.transfer_phone_number = spec.transfer_phone_number;
      if (spec.background_track && spec.background_track !== "none") configBody.background_track = spec.background_track;
      if (spec.speaking_speed && spec.speaking_speed !== 1.0) configBody.voice_settings = { speed: spec.speaking_speed };
      if (spec.pronunciation_guide && Array.isArray(spec.pronunciation_guide) && spec.pronunciation_guide.length > 0) configBody.pronunciation_guide = spec.pronunciation_guide;

      const configResp = await fetch(`https://api.bland.ai/v1/inbound/${encodeURIComponent(num.phone_number)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify(configBody),
      });
      const configData = await configResp.json();
      console.log("Bland inbound config response:", JSON.stringify(configData));
      if (!configResp.ok) {
        throw new Error(`Bland config error: ${JSON.stringify(configData)}`);
      }

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
