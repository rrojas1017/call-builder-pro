import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";
import { buildTaskPrompt } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tool schemas ──

const AUDIT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_audit",
    description: "Submit the structured audit results for all six categories.",
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        ["prompt_engineering", "evaluation_loop", "voice_config", "knowledge_pipeline", "feedback_loop", "missed_opportunities"].map((cat) => [
          cat,
          {
            type: "object",
            properties: {
              rating: { type: "number", description: "1-10 rating" },
              findings: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
            },
            required: ["rating", "findings", "recommendations"],
          },
        ])
      ),
      required: ["prompt_engineering", "evaluation_loop", "voice_config", "knowledge_pipeline", "feedback_loop", "missed_opportunities"],
    },
  },
};

const findingItemSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    source: { type: "string", enum: ["both", "claude", "gpt"] },
    priority: { type: "string", enum: ["critical", "important", "minor"] },
  },
  required: ["text", "source", "priority"],
};

const recItemSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    source: { type: "string", enum: ["both", "claude", "gpt"] },
    priority: { type: "string", enum: ["critical", "important", "minor"] },
    cross_agent_note: { type: "string", description: "Note referencing a fix from a sibling agent, or null" },
  },
  required: ["text", "source", "priority"],
};

const mergedCategorySchema = {
  type: "object",
  properties: {
    rating: { type: "number", description: "Single consensus 1-10 rating" },
    findings: { type: "array", items: findingItemSchema },
    recommendations: { type: "array", items: recItemSchema },
  },
  required: ["rating", "findings", "recommendations"],
};

const MERGE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_merged_audit",
    description: "Submit the unified merged audit combining both model outputs into a single de-duplicated set of findings and recommendations per category.",
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        ["prompt_engineering", "evaluation_loop", "voice_config", "knowledge_pipeline", "feedback_loop", "missed_opportunities"].map((cat) => [
          cat,
          mergedCategorySchema,
        ])
      ),
      required: ["prompt_engineering", "evaluation_loop", "voice_config", "knowledge_pipeline", "feedback_loop", "missed_opportunities"],
    },
  },
};

// ── Prompts ──

const SYSTEM_PROMPT = `You are an expert AI training pipeline auditor specializing in voice AI agents.

You are reviewing the FULL training pipeline of a voice AI agent — from prompt engineering, through call execution, evaluation, and iterative improvement.

Your job is to assess whether the current approach is the MOST EFFICIENT and FUNCTIONAL option. Be specific, actionable, and brutally honest.

Evaluate these 6 categories (1-10 each):

1. PROMPT ENGINEERING — Is the task prompt structure optimal? Too long/short? Conflicting instructions? Is knowledge injection effective? Are humanization notes working?

2. EVALUATION LOOP — Is the scoring rubric catching the right issues? Are improvements actually improving scores? Is anti-repetition working? Are evaluations language-appropriate?

3. VOICE AI CONFIGURATION — Are temperature, interruption_threshold, speaking_speed optimal for the use case? Is the model choice right? Are pronunciation guides helping?

4. KNOWLEDGE PIPELINE — Is auto-research producing useful knowledge? Is summarization losing critical details? Are winning patterns being extracted effectively? Is knowledge categorization correct?

5. TRAINING FEEDBACK LOOP — Is the evaluate->improve->re-test cycle converging? Are there bottlenecks? Circular improvements? Score regressions between versions?

6. MISSED OPPORTUNITIES — What voice AI features aren't being used? What prompt techniques could help? Any architectural improvements?

Use the submit_audit tool to return your structured findings.`;

const MERGE_SYSTEM_PROMPT = `You are an expert AI audit consolidator. You receive two independent audit reports (from Claude and GPT) of the same voice AI training pipeline, plus a history of recent improvements applied to other agents in the same organization.

Your job:
1. MERGE the two audits into a single unified set of findings and recommendations per category.
2. DE-DUPLICATE: When both models say the same thing in different words, keep the more specific/actionable version and mark source as "both".
3. PRIORITIZE: Assign each finding and recommendation a priority: "critical" (blocks performance), "important" (significant impact), "minor" (nice to have).
4. CROSS-AGENT LEARNING: If a recommendation overlaps with a fix already applied to a sibling agent, add a cross_agent_note explaining what was done and the result (e.g., "Agent 'Sarah' applied temperature 0.4 — consider the same here").
5. CONSENSUS RATING: Produce a single rating per category. If both models agree within 1 point, average them. If they disagree by 3+, lean toward the lower score and note the disagreement in findings.
6. Do NOT invent new findings — only merge what the two models provided.

Use the submit_merged_audit tool to return your unified results.`;

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Collect all data in parallel ──
    const [specRes, knowledgeRes, callsRes, improvementsRes, snapshotsRes, behaviorsRes, projectRes] = await Promise.all([
      sb.from("agent_specs").select("*").eq("project_id", project_id).maybeSingle(),
      sb.from("agent_knowledge").select("*").eq("project_id", project_id),
      sb.from("calls").select("*, evaluations(*)").eq("project_id", project_id).order("created_at", { ascending: false }).limit(20),
      sb.from("improvements").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(10),
      sb.from("score_snapshots").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(20),
      sb.from("global_human_behaviors").select("*").limit(50),
      sb.from("agent_projects").select("id, name, org_id, description").eq("id", project_id).single(),
    ]);

    if (!projectRes.data) {
      return new Response(JSON.stringify({ error: "Agent project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = projectRes.data.org_id;
    const spec = specRes.data || {};
    const knowledge = knowledgeRes.data || [];
    const calls = callsRes.data || [];
    const improvements = improvementsRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const behaviors = behaviorsRes.data || [];

    const compiledPrompt = buildTaskPrompt(
      spec as any,
      knowledge.map((k: any) => ({ category: k.category, content: k.content }))
    );

    // Build payload for both models
    const payload = JSON.stringify({
      agent_name: projectRes.data.name,
      agent_description: projectRes.data.description,
      spec_config: {
        use_case: spec.use_case, mode: spec.mode, tone_style: spec.tone_style,
        language: spec.language, voice_id: spec.voice_id, voice_provider: spec.voice_provider,
        temperature: spec.temperature, interruption_threshold: spec.interruption_threshold,
        speaking_speed: spec.speaking_speed, opening_line: spec.opening_line,
        transfer_phone_number: spec.transfer_phone_number, transfer_required: spec.transfer_required,
        consent_required: spec.consent_required, disclosure_required: spec.disclosure_required,
        disclosure_text: spec.disclosure_text, must_collect_fields: spec.must_collect_fields,
        qualification_rules: spec.qualification_rules, disqualification_rules: spec.disqualification_rules,
        escalation_rules: spec.escalation_rules, business_rules: spec.business_rules,
        pronunciation_guide: spec.pronunciation_guide, humanization_notes: spec.humanization_notes,
        background_track: spec.background_track, voicemail_message: spec.voicemail_message,
        sms_enabled: spec.sms_enabled, version: spec.version,
      },
      compiled_task_prompt: compiledPrompt,
      compiled_prompt_char_count: compiledPrompt.length,
      knowledge_entries: knowledge.map((k: any) => ({ category: k.category, content: k.content, source_type: k.source_type })),
      recent_calls: calls.map((c: any) => ({
        outcome: c.outcome, duration_seconds: c.duration_seconds, version: c.version,
        transcript_length: c.transcript?.length || 0,
        transcript_preview: c.transcript?.substring(0, 500) || null,
        evaluation: c.evaluations?.[0] ? {
          overall_score: c.evaluations[0].overall_score, rubric: c.evaluations[0].rubric,
          issues: c.evaluations[0].issues, recommended_fixes: c.evaluations[0].recommended_fixes,
        } : null,
      })),
      improvements: improvements.map((imp: any) => ({
        from_version: imp.from_version, to_version: imp.to_version,
        change_summary: imp.change_summary, patch: imp.patch, created_at: imp.created_at,
      })),
      score_snapshots: snapshots.map((s: any) => ({
        spec_version: s.spec_version, voice_id: s.voice_id, avg_overall: s.avg_overall,
        avg_humanness: s.avg_humanness, avg_naturalness: s.avg_naturalness,
        call_count: s.call_count, created_at: s.created_at,
      })),
      global_human_behaviors: behaviors.map((b: any) => ({ content: b.content, source_type: b.source_type })),
    }, null, 2);

    const userMessage = `Here is the complete training pipeline data for the agent "${projectRes.data.name}". Analyze every aspect and provide your structured audit:\n\n${payload}`;

    // ── Step 1: Dual model review in parallel (both via Lovable AI gateway) ──
    const [claudeResult, gptResult] = await Promise.all([
      callAI({
        provider: "gemini",
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
        tools: [AUDIT_TOOL],
        tool_choice: { type: "function", function: { name: "submit_audit" } },
        max_tokens: 8192,
        temperature: 0.3,
      }),
      callAI({
        provider: "gemini",
        model: "openai/gpt-5.2",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
        tools: [AUDIT_TOOL],
        tool_choice: { type: "function", function: { name: "submit_audit" } },
        max_tokens: 8192,
        temperature: 0.3,
      }),
    ]);

    const claudeAudit = claudeResult.tool_calls?.[0]?.arguments || null;
    const gptAudit = gptResult.tool_calls?.[0]?.arguments || null;

    // ── Step 2: Fetch cross-agent improvements ──
    const { data: crossAgentImprovements } = await sb
      .from("improvements")
      .select("change_summary, patch, created_at, project_id")
      .neq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter to same-org improvements by joining with agent_projects
    let siblingFixes: { agent_name: string; change_summary: string; patch: any; created_at: string }[] = [];
    if (crossAgentImprovements && crossAgentImprovements.length > 0) {
      const projectIds = [...new Set(crossAgentImprovements.map((i: any) => i.project_id))];
      const { data: siblingProjects } = await sb
        .from("agent_projects")
        .select("id, name, org_id")
        .in("id", projectIds)
        .eq("org_id", orgId);

      const orgProjectMap = new Map((siblingProjects || []).map((p: any) => [p.id, p.name]));

      // Filter to only same-org and last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      siblingFixes = crossAgentImprovements
        .filter((i: any) => orgProjectMap.has(i.project_id) && i.created_at > thirtyDaysAgo)
        .slice(0, 20)
        .map((i: any) => ({
          agent_name: orgProjectMap.get(i.project_id)!,
          change_summary: i.change_summary,
          patch: i.patch,
          created_at: i.created_at,
        }));
    }

    // ── Step 3: Merge with Gemini Flash ──
    let unifiedResults: any = null;
    if (claudeAudit && gptAudit) {
      const mergeUserMessage = `Merge these two independent audit reports into a single unified set of findings and recommendations.

CLAUDE AUDIT:
${JSON.stringify(claudeAudit, null, 2)}

GPT-5.2 AUDIT:
${JSON.stringify(gptAudit, null, 2)}

${siblingFixes.length > 0 ? `CROSS-AGENT IMPROVEMENTS (fixes applied to other agents in the same org in the last 30 days):
${JSON.stringify(siblingFixes, null, 2)}` : "No cross-agent improvement history available."}

Merge these into a single unified audit using the submit_merged_audit tool.`;

      const mergeResult = await callAI({
        provider: "gemini",
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: MERGE_SYSTEM_PROMPT },
          { role: "user", content: mergeUserMessage },
        ],
        tools: [MERGE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_merged_audit" } },
        max_tokens: 8192,
        temperature: 0.2,
      });

      unifiedResults = mergeResult.tool_calls?.[0]?.arguments || null;
    }

    // Calculate merged score from unified results (or fallback to raw average)
    let mergedScore: number | null = null;
    const categories = ["prompt_engineering", "evaluation_loop", "voice_config", "knowledge_pipeline", "feedback_loop", "missed_opportunities"];

    if (unifiedResults) {
      let total = 0, count = 0;
      for (const cat of categories) {
        const r = (unifiedResults as any)[cat]?.rating;
        if (typeof r === "number") { total += r; count++; }
      }
      mergedScore = count > 0 ? Math.round((total / count) * 10) / 10 : null;
    } else if (claudeAudit && gptAudit) {
      let total = 0, count = 0;
      for (const cat of categories) {
        const cr = (claudeAudit as any)[cat]?.rating;
        const gr = (gptAudit as any)[cat]?.rating;
        if (typeof cr === "number") { total += cr; count++; }
        if (typeof gr === "number") { total += gr; count++; }
      }
      mergedScore = count > 0 ? Math.round((total / count) * 10) / 10 : null;
    }

    // ── Save to database ──
    const { data: auditRow, error: insertErr } = await sb
      .from("training_audits")
      .insert({
        project_id,
        org_id: orgId,
        claude_results: claudeAudit,
        gpt_results: gptAudit,
        merged_score: mergedScore,
        unified_results: unifiedResults,
        cross_agent_context: siblingFixes.length > 0 ? siblingFixes : null,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to save audit:", insertErr);
    }

    return new Response(
      JSON.stringify({
        id: auditRow?.id,
        claude_results: claudeAudit,
        gpt_results: gptAudit,
        unified_results: unifiedResults,
        cross_agent_context: siblingFixes.length > 0 ? siblingFixes : null,
        merged_score: mergedScore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("audit-training-pipeline error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
