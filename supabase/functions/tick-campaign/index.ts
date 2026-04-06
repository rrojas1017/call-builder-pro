import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

// NOTE: Pre-flight logic (agent sync, knowledge summarization, prompt injection) now runs ONCE in start-campaign

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tickStart = Date.now();
  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");
    console.log(`[tick-campaign] ===== START ===== campaign_id=${campaign_id}`);

    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*, agent_projects!campaigns_agent_project_id_fkey(id, org_id)")
      .eq("id", campaign_id)
      .single();
    if (campErr) throw campErr;
    if (campaign.status !== "running") {
      return new Response(JSON.stringify({ message: "Campaign not running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SCHEDULE CHECK =====
    if (campaign.schedule_enabled) {
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const reverseDayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const tz = campaign.schedule_timezone || "America/New_York";

      // Get current time in the campaign's timezone
      const nowStr = new Date().toLocaleString("en-US", { timeZone: tz });
      const nowInTz = new Date(nowStr);
      const currentDay = reverseDayMap[nowInTz.getDay()];
      const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

      // Check if today is a dialing day
      const dialDays: string[] = campaign.schedule_days || ["mon", "tue", "wed", "thu", "fri"];
      if (!dialDays.includes(currentDay)) {
        console.log(`[tick-campaign] Schedule: ${currentDay} not in dialing days ${dialDays.join(",")}`);
        return new Response(JSON.stringify({ message: "Outside scheduled dialing days", day: currentDay }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check time window (with per-day overrides)
      const overrides = campaign.schedule_day_overrides || {};
      const dayOverride = overrides[currentDay];
      const startTime = dayOverride?.start || campaign.schedule_start_time || "09:00";
      const endTime = dayOverride?.end || campaign.schedule_end_time || "17:00";
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        console.log(`[tick-campaign] Schedule: current time ${nowInTz.toLocaleTimeString()} outside ${startTime}-${endTime} (${tz})`);
        return new Response(JSON.stringify({ message: "Outside scheduled dialing hours", current: nowInTz.toLocaleTimeString(), window: `${startTime}-${endTime}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[tick-campaign] Schedule OK: ${currentDay} ${nowInTz.toLocaleTimeString()} within ${startTime}-${endTime} (${tz})`);
    }

    // Check org credit balance
    const orgId = campaign.agent_projects.org_id;
    console.log(`[tick-campaign] org_id=${orgId}, project_id=${campaign.project_id}, status=${campaign.status}`);
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", orgId).single();
    console.log(`[tick-campaign] Credit balance: ${orgData?.credits_balance ?? 'N/A'}`);
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load trusted outbound numbers for rotation
    const { data: trustedNumbers } = await supabase
      .from("outbound_numbers").select("id, phone_number")
      .eq("org_id", orgId).eq("status", "trusted")
      .order("last_used_at", { ascending: true, nullsFirst: true });
    let trustedNumberIndex = 0;
    console.log(`[tick-campaign] Trusted outbound numbers: ${trustedNumbers?.length ?? 0}`, trustedNumbers?.map((n: any) => n.phone_number));

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", campaign.project_id).single();
    if (specErr) throw specErr;

    const retellAgentId = spec.retell_agent_id;
    if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
    console.log(`[tick-campaign] retell_agent_id=${retellAgentId}, spec_version=${spec.version}`);

    // Count currently active calls to enforce concurrency limit
    const { count: activeCalls } = await supabase
      .from("contacts").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).eq("status", "calling");

    const slotsAvailable = campaign.max_concurrent_calls - (activeCalls || 0);
    console.log(`[tick-campaign] Active calls: ${activeCalls}, max: ${campaign.max_concurrent_calls}, slots available: ${slotsAvailable}`);
    if (slotsAvailable <= 0) {
      return new Response(JSON.stringify({ message: "All concurrent slots busy", active: activeCalls, max: campaign.max_concurrent_calls }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch only as many queued contacts as we have slots for
    const { data: contacts } = await supabase
      .from("contacts").select("*")
      .eq("campaign_id", campaign_id).eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (!contacts || contacts.length === 0) {
      const { count: remaining } = await supabase
        .from("contacts").select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id).in("status", ["queued", "calling"]);
      if ((remaining || 0) === 0) {
        // === REDIAL PASS ===
        const maxAttempts = campaign.max_attempts || 1;
        const redialDelayMin = campaign.redial_delay_minutes || 60;
        const redialStatuses: string[] = campaign.redial_statuses || ["voicemail", "no_answer", "busy"];

        if (maxAttempts > 1 && redialStatuses.length > 0) {
          const cutoff = new Date(Date.now() - redialDelayMin * 60 * 1000).toISOString();
          const { data: retryable } = await supabase
            .from("contacts")
            .select("id, attempts")
            .eq("campaign_id", campaign_id)
            .in("status", redialStatuses)
            .lt("called_at", cutoff)
            .lt("attempts", maxAttempts);

          if (retryable && retryable.length > 0) {
            const retryIds = retryable.map((r: any) => r.id);
            await supabase.from("contacts").update({ status: "queued" }).in("id", retryIds);
            console.log(`Re-queued ${retryIds.length} contacts for redial`);
            return new Response(JSON.stringify({ message: "Re-queued contacts for redial", count: retryIds.length }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign_id);
      }
      return new Response(JSON.stringify({ message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine from_number for batch call
    let fromNumber = spec.from_number || null;
    console.log(`[tick-campaign] spec.from_number=${fromNumber}`);
    if (!fromNumber && trustedNumbers && trustedNumbers.length > 0) {
      const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
      fromNumber = picked.phone_number;
      trustedNumberIndex++;
      await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
    }

    console.log(`[tick-campaign] Selected from_number: ${fromNumber}`);
    if (!fromNumber) {
      return new Response(JSON.stringify({
        error: "No outbound number available. Please add a trusted phone number in Settings > Phone Numbers, or set a From Number on your agent.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build tasks array for Retell batch API
    const tasks = contacts.map((contact: any) => {
      const firstName = contact.name?.trim().split(/\s+/)[0] || "";
      return {
        to_number: contact.phone,
        retell_llm_dynamic_variables: {
          first_name: firstName,
          agent_name: spec.persona_name || campaign.agent_projects?.name || "Agent",
          contact_name: contact.name || "",
          ...(contact.extra_data && typeof contact.extra_data === "object" ? contact.extra_data : {}),
        },
        metadata: {
          org_id: campaign.agent_projects.org_id,
          project_id: campaign.project_id,
          campaign_id,
          contact_id: contact.id,
          version: spec.version,
        },
      };
    });

    const batchPayload: any = {
      from_number: fromNumber,
      tasks,
      override_agent_id: retellAgentId,
    };
    console.log(`[tick-campaign] Batch payload: ${tasks.length} tasks, agent=${retellAgentId}, from=${fromNumber}`);
    console.log(`[tick-campaign] Task phones: ${tasks.map((t: any) => t.to_number).join(", ")}`);

    const retellResp = await fetch("https://api.retellai.com/create-batch-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(batchPayload),
    });
    const retellData = await retellResp.json();
    console.log("Retell Batch API response:", retellResp.status, JSON.stringify(retellData));

    if (!retellResp.ok) {
      throw new Error(`Retell Batch API error [${retellResp.status}]: ${JSON.stringify(retellData)}`);
    }

    const batchId = retellData.batch_call_id || retellData.id;
    if (batchId) {
      await supabase.from("campaigns").update({ retell_batch_id: batchId }).eq("id", campaign_id);
    }

    // Mark all contacts as calling
    const contactIds = contacts.map((c: any) => c.id);
    console.log(`[tick-campaign] Marking ${contactIds.length} contacts as calling: ${contactIds.join(", ")}`);
    await supabase.from("contacts").update({
      status: "calling", called_at: new Date().toISOString(),
    }).in("id", contactIds);

    console.log(`[tick-campaign] ===== DONE ===== ${Date.now() - tickStart}ms`);
    return new Response(JSON.stringify({
      provider: "retell", batch_id: batchId, contacts_dispatched: contacts.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`[tick-campaign] ERROR after ${Date.now() - tickStart}ms:`, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
