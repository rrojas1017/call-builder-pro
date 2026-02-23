import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETELL_BASE = "https://api.retellai.com";

const LANG_MAP: Record<string, string> = {
  en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR",
  it: "it-IT", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", ar: "ar-SA",
  hi: "hi-IN", ru: "ru-RU", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE",
};

function isValidRetellVoiceId(id?: string): boolean {
  if (!id) return false;
  const validPrefixes = ["11labs-", "cartesia-", "openai-", "minimax-", "eleven_", "deepgram-", "playht-"];
  return validPrefixes.some(prefix => id.startsWith(prefix));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const retellKey = Deno.env.get("RETELL_API_KEY");
    if (!retellKey) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

    const db = createClient(supabaseUrl, serviceKey);

    const { data: specs, error: dbErr } = await db
      .from("agent_specs")
      .select("id, project_id, voice_id, language, persona_name, agent_projects(name, description, source_text)")
      .is("retell_agent_id", null);

    if (dbErr) throw new Error(`DB query failed: ${dbErr.message}`);
    if (!specs || specs.length === 0) {
      return new Response(JSON.stringify({ synced: 0, results: [], message: "All agents already provisioned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ project_name: string; agent_id: string | null; status: string; error?: string }> = [];

    for (const spec of specs) {
      const project = (spec as any).agent_projects;
      const projectName = project?.name || "Unnamed";

      try {
        // Map language code
        const lang = spec.language || "en";
        let retellLang: string;
        if (lang.includes(",")) {
          retellLang = "multi";
        } else {
          retellLang = LANG_MAP[lang.trim()] || lang;
          if (!retellLang.includes("-") && retellLang !== "multi") {
            retellLang = "en-US";
          }
        }

        // Build prompt from project description + source_text
        const promptParts: string[] = [];
        if (project?.description) promptParts.push(project.description);
        if (project?.source_text) promptParts.push(project.source_text);
        const generalPrompt = promptParts.join("\n\n");
        const trimmedPrompt = generalPrompt.length > 28000
          ? generalPrompt.substring(0, 28000) + "\n\n[Trimmed for length]"
          : generalPrompt;

        // 1. Create Retell LLM first
        const llmBody: Record<string, unknown> = {};
        if (trimmedPrompt.length > 0) {
          llmBody.general_prompt = trimmedPrompt;
        }

        const llmRes = await fetch(`${RETELL_BASE}/create-retell-llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellKey}` },
          body: JSON.stringify(llmBody),
        });
        const llmData = await llmRes.json();
        if (!llmRes.ok) throw new Error(`Failed to create LLM: ${llmData.error_message || JSON.stringify(llmData)}`);
        const llmId = llmData.llm_id;
        console.log(`Created LLM ${llmId} for ${projectName}`);

        // 2. Create the Retell agent with the LLM id
        const voiceId = isValidRetellVoiceId(spec.voice_id) ? spec.voice_id : "11labs-Adrian";

        const createBody: Record<string, unknown> = {
          agent_name: projectName,
          voice_id: voiceId,
          language: retellLang,
          response_engine: { type: "retell-llm", llm_id: llmId },
          webhook_url: webhookUrl,
          post_call_analysis_data: [
            { description: "Whether the lead was qualified", name: "qualified", type: "boolean" },
            { description: "Brief summary of the call", name: "call_summary", type: "string" },
          ],
        };

        const createRes = await fetch(`${RETELL_BASE}/create-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellKey}` },
          body: JSON.stringify(createBody),
        });
        const agentData = await createRes.json();
        if (!createRes.ok) throw new Error(agentData.error_message || agentData.message || JSON.stringify(agentData));

        const newAgentId = agentData.agent_id;

        // 3. Update agent_specs with new retell_agent_id
        const { error: updateErr } = await db
          .from("agent_specs")
          .update({ retell_agent_id: newAgentId })
          .eq("id", spec.id);

        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

        results.push({ project_name: projectName, agent_id: newAgentId, status: "synced" });
        console.log(`✅ Synced ${projectName} -> ${newAgentId}`);
      } catch (e) {
        console.error(`❌ Failed ${projectName}:`, e);
        results.push({ project_name: projectName, agent_id: null, status: "error", error: e.message });
      }
    }

    const synced = results.filter(r => r.status === "synced").length;
    return new Response(JSON.stringify({ synced, total: specs.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bulk-sync-retell-agents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
