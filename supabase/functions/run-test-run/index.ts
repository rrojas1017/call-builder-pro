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

    const callIds: string[] = [];

    if (voiceProvider === "retell") {
      // ===== RETELL AI BRANCH =====
      const retellApiKey = Deno.env.get("RETELL_API_KEY");
      if (!retellApiKey) throw new Error("RETELL_API_KEY not configured");
      const retellAgentId = spec?.retell_agent_id;
      if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");

      // Pre-flight: auto-fix transfer agents so they can make outbound calls
      try {
        const agentCheckRes = await fetch(`https://api.retellai.com/get-agent/${retellAgentId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${retellApiKey}` },
        });
        const agentCheckData = await agentCheckRes.json();
        if (agentCheckRes.ok && agentCheckData.is_transfer_agent) {
          // Patch agent-level transfer flag
          const agentPatchRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
            body: JSON.stringify({ is_transfer_agent: false }),
          });
          if (agentPatchRes.ok) {
            console.log(`Auto-switched agent ${retellAgentId} is_transfer_agent to false`);
          } else {
            console.error("Failed to patch agent is_transfer_agent:", await agentPatchRes.text());
          }

          // Also patch LLM if it exists
          const llmId = agentCheckData.response_engine?.llm_id;
          if (llmId) {
            const llmPatchRes = await fetch(`https://api.retellai.com/update-retell-llm/${llmId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
              body: JSON.stringify({ is_transfer_llm: false }),
            });
            if (llmPatchRes.ok) {
              console.log(`Auto-switched LLM ${llmId} is_transfer_llm to false`);
            } else {
              console.error("Failed to patch LLM is_transfer_llm:", await llmPatchRes.text());
            }
          }

          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for Retell propagation
        }
      } catch (preflight: any) {
        console.error("Transfer agent pre-flight check failed:", preflight.message);
      }

      for (const contact of queuedContacts) {
        try {
          const retellPayload: any = {
            override_agent_id: retellAgentId,
            to_number: contact.phone,
            metadata: {
              test_run_id, test_run_contact_id: contact.id,
              org_id: testRun.org_id, project_id: testRun.project_id,
              spec_version: testRun.spec_version,
            },
          };
          if (spec?.from_number) {
            retellPayload.from_number = spec.from_number;
          } else if (trustedNumbers && trustedNumbers.length > 0) {
            const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
            retellPayload.from_number = picked.phone_number;
            trustedNumberIndex++;
            await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
          }

          // Guard: Retell requires from_number
          if (!retellPayload.from_number) {
            await supabase.from("test_run_contacts").update({
              status: "failed",
              error: "No outbound number available. Please add a trusted phone number in Settings > Phone Numbers, or set a From Number on your agent.",
            }).eq("id", contact.id);
            continue;
          }

          // Retry loop for transfer agent propagation delay
          let retellData: any = {};
          const maxRetries = 3;
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const retellResp = await fetch("https://api.retellai.com/v2/create-phone-call", {
              method: "POST",
              headers: { Authorization: `Bearer ${retellApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify(retellPayload),
            });
            retellData = await retellResp.json();
            console.log(`Retell API response (attempt ${attempt}):`, retellResp.status, JSON.stringify(retellData));

            const errMsg = retellData.message || retellData.error || "";
            if (typeof errMsg === "string" && errMsg.includes("Transfer agents cannot be used for outbound calls") && attempt < maxRetries) {
              console.warn(`Transfer agent not yet propagated, retrying in 3s (attempt ${attempt}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              continue;
            }
            break;
          }

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
          // Build per-contact prompt with caller name context
          const perContactTask = testRun.agent_instructions_text
            ? replaceTemplateVars(testRun.agent_instructions_text, contact, spec?.persona_name)
            : (spec ? buildTaskPrompt(spec, [], knowledgeBriefing, contact.name?.trim() || "") : "Conduct a professional outbound call.");
          const contactTask = perContactTask.length > 28000
            ? perContactTask.substring(0, 28000) + "\n\n[Trimmed for length]"
            : perContactTask;

          const rawFirstSentence = spec?.opening_line
            ? spec.opening_line.replace(/\{\{agent_name\}\}/gi, spec?.persona_name || "")
            : undefined;
          // Fix blank-name fallback: strip {{first_name}} and ask for name naturally
          let contactFirstSentence: string | undefined;
          if (rawFirstSentence) {
            const firstName = contact.name?.trim().split(/\s+/)[0] || "";
            if (firstName) {
              contactFirstSentence = replaceTemplateVars(rawFirstSentence, contact, spec?.persona_name);
            } else {
              // Remove {{first_name}} placeholder and append a name-asking phrase
              const lang = (spec?.language || "en").toLowerCase();
              const askName = lang.startsWith("es") ? " ¿Con quién tengo el gusto?" : " May I ask who I'm speaking with?";
              contactFirstSentence = rawFirstSentence.replace(/\{\{first_name\}\}[,!]?\s*/gi, "").trim() + askName;
            }
          }

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
