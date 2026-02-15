import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt, replaceTemplateVars } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Load trusted outbound numbers for rotation
    const { data: trustedNumbers } = await supabase
      .from("outbound_numbers").select("id, phone_number")
      .eq("org_id", testRun.org_id).eq("status", "trusted")
      .order("last_used_at", { ascending: true, nullsFirst: true });
    let trustedNumberIndex = 0;

    // Summarize agent knowledge via AI (replaces raw knowledge fetch)
    let knowledgeBriefing = "";
    try {
      const { data: summaryData, error: summaryErr } = await supabase.functions.invoke("summarize-agent-knowledge", {
        body: { project_id: testRun.project_id },
      });
      if (summaryErr) {
        console.error("Knowledge summarization error:", summaryErr);
      } else if (summaryData?.briefing) {
        knowledgeBriefing = summaryData.briefing;
        console.log(`Knowledge briefing: ${summaryData.entries_count} entries → ${knowledgeBriefing.length} chars`);
      }
    } catch (sumErr: any) {
      console.error("Failed to invoke summarize-agent-knowledge:", sumErr.message);
    }

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
    let baseTask = testRun.agent_instructions_text || (spec ? buildTaskPrompt(spec, [], knowledgeBriefing) : "Conduct a professional outbound call.");

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
          if (spec?.from_number) {
            retellPayload.from_number = spec.from_number;
          } else if (trustedNumbers && trustedNumbers.length > 0) {
            const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
            retellPayload.from_number = picked.phone_number;
            trustedNumberIndex++;
            await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
          }

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
          // Use spec.from_number if set, otherwise pick from trusted pool
          if (spec?.from_number) {
            blandPayload.from = spec.from_number;
          } else if (trustedNumbers && trustedNumbers.length > 0) {
            const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
            blandPayload.from = picked.phone_number;
            trustedNumberIndex++;
            await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
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

    return new Response(JSON.stringify({
      initiated_count: callIds.length,
      call_ids: callIds,
      provider: voiceProvider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("run-test-run error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
