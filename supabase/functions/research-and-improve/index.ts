import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateSearchQueries(spec: any, evaluation: any) {
  const useCase = spec?.use_case || "phone sales";
  const issues = evaluation?.issues_detected || [];
  const suggestions = evaluation?.humanness_suggestions || [];
  const knowledgeGaps = evaluation?.knowledge_gaps || [];
  const gaps = [...issues, ...suggestions].slice(0, 5);

  const queries: { query: string; category: string }[] = [
    { query: `best natural conversation techniques for ${useCase} phone calls`, category: "conversation_technique" },
    { query: `${useCase} key product knowledge facts for sales agents 2026`, category: "product_knowledge" },
    { query: `common objections in ${useCase} and how to handle them naturally`, category: "objection_handling" },
  ];

  if (gaps.length > 0) {
    queries.push({ query: `how to ${gaps[0].toLowerCase()} on phone calls naturally`, category: "conversation_technique" });
  }

  for (const gap of knowledgeGaps.slice(0, 2)) {
    queries.push({ query: `${useCase} ${gap}`, category: "product_knowledge" });
  }

  queries.push({ query: `${useCase} industry trends and competitor comparison 2026`, category: "industry_insight" });

  return queries.slice(0, 6);
}

async function executeResearch(supabase: any, projectId: string, searchQueries: { query: string; category: string }[], spec: any) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const allResults: { title: string; url: string; markdown: string; category: string }[] = [];

  for (const { query, category } of searchQueries) {
    try {
      const resp = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
      });

      if (resp.ok) {
        const data = await resp.json();
        for (const r of (data.data || [])) {
          if (r.markdown || r.description) {
            allResults.push({
              title: r.title || r.url || "",
              url: r.url || "",
              markdown: (r.markdown || r.description || "").slice(0, 2000),
              category,
            });
          }
        }
      } else {
        console.error("Firecrawl search failed:", resp.status, await resp.text());
      }
    } catch (e) {
      console.error("Firecrawl search error:", e);
    }
  }

  if (allResults.length === 0) {
    return { entries: [], allResults: [] };
  }

  console.log(`Found ${allResults.length} articles, distilling...`);

  const useCase = spec?.use_case || "phone sales";
  const researchContext = allResults
    .map((r, i) => `Article ${i + 1} [${r.category}] (${r.title}):\n${r.markdown}`)
    .join("\n\n---\n\n");

  const distillPrompt = `You are a domain expert and conversation coach. The AI phone agent works in: ${useCase}

Below are articles. Distill them into categorized knowledge entries.

For each entry, provide:
- "category": one of "conversation_technique", "product_knowledge", "objection_handling", "industry_insight", "competitor_info"
- "content": a specific, actionable piece of knowledge with example phrases where applicable
- "source_url": the article URL it came from

Rules:
- Be concrete: give example phrases for conversation techniques, specific facts for product knowledge
- Each entry should be self-contained and useful on its own
- Return 5-10 entries across multiple categories

ARTICLES:
${researchContext}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You extract categorized knowledge from articles for an AI phone agent." },
        { role: "user", content: distillPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_knowledge",
          description: "Return categorized knowledge entries.",
          parameters: {
            type: "object",
            properties: {
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string", enum: ["conversation_technique", "product_knowledge", "objection_handling", "industry_insight", "competitor_info"] },
                    content: { type: "string" },
                    source_url: { type: "string" },
                  },
                  required: ["category", "content"],
                },
              },
            },
            required: ["entries"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_knowledge" } },
    }),
  });

  if (!aiResp.ok) {
    console.error("AI distillation failed:", aiResp.status, await aiResp.text());
    return { entries: [], allResults };
  }

  const aiData = await aiResp.json();
  let entries: { category: string; content: string; source_url?: string }[] = [];

  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const parsed = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    entries = parsed.entries || [];
  }

  return { entries, allResults };
}

async function saveKnowledge(supabase: any, projectId: string, entries: any[], allResults: any[], spec: any) {
  const { data: existingKnowledge } = await supabase
    .from("agent_knowledge")
    .select("content")
    .eq("project_id", projectId);

  const existingContents = new Set((existingKnowledge || []).map((k: any) => k.content.toLowerCase().trim()));

  const newEntries = entries.filter(
    (e: any) => !existingContents.has(e.content.toLowerCase().trim())
  );

  if (newEntries.length > 0) {
    const rows = newEntries.map((e: any) => ({
      project_id: projectId,
      category: e.category,
      content: e.content,
      source_url: e.source_url || null,
      source_type: "auto_research",
    }));

    const { error: insertErr } = await supabase.from("agent_knowledge").insert(rows);
    if (insertErr) console.error("Failed to insert knowledge:", insertErr);
    else console.log(`Saved ${newEntries.length} new knowledge entries`);
  }

  // Save conversation techniques to global_human_behaviors
  const conversationTechniques = entries
    .filter((e: any) => e.category === "conversation_technique")
    .map((e: any) => e.content);

  if (conversationTechniques.length > 0) {
    try {
      const { data: existingGlobal } = await supabase
        .from("global_human_behaviors").select("content");
      const existingGlobalSet = new Set((existingGlobal || []).map((g: any) => g.content.toLowerCase().trim()));
      const globalNew = conversationTechniques.filter(
        (t: string) => !existingGlobalSet.has(t.toLowerCase().trim())
      );
      if (globalNew.length > 0) {
        await supabase.from("global_human_behaviors").insert(
          globalNew.map((t: string) => ({
            content: t,
            source_type: "auto_learned",
            source_agent_id: projectId,
          }))
        );
        console.log(`Saved ${globalNew.length} techniques to global human behaviors`);
      }
    } catch (e) {
      console.error("Failed to save global behaviors:", e);
    }
  }

  // Merge conversation techniques into humanization_notes for backward compat
  const techniques = entries
    .filter((e: any) => e.category === "conversation_technique")
    .map((e: any) => e.content);

  const currentNotes: string[] = Array.isArray(spec?.humanization_notes) ? spec.humanization_notes : [];
  const newTechniques = techniques.filter(
    (t: string) => !currentNotes.some((existing: string) => existing.toLowerCase() === t.toLowerCase())
  );

  if (newTechniques.length > 0) {
    const merged = [...currentNotes, ...newTechniques].slice(-20);
    const sources = allResults.map((r: any) => r.url).filter(Boolean);
    const currentSources: string[] = Array.isArray(spec?.research_sources) ? spec.research_sources : [];
    const mergedSources = [...new Set([...currentSources, ...sources])].slice(-30);

    await supabase
      .from("agent_specs")
      .update({ humanization_notes: merged, research_sources: mergedSources })
      .eq("project_id", projectId);

    console.log(`Merged ${newTechniques.length} conversation techniques into humanization_notes`);
  }

  return newEntries.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { project_id, evaluation, spec, mode, request_id } = body;
    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── MODE: REQUEST — Create a pending research request for admin approval ──
    if (mode === "request") {
      const searchQueries = generateSearchQueries(spec, evaluation);

      // Get org_id from project
      const { data: project } = await supabase
        .from("agent_projects")
        .select("org_id")
        .eq("id", project_id)
        .single();

      if (!project) throw new Error("Project not found");

      const humanness_score = evaluation?.humanness_score || null;
      const knowledge_gaps = evaluation?.knowledge_gaps || [];

      const { data: request, error: reqErr } = await supabase
        .from("research_requests")
        .insert({
          project_id,
          org_id: project.org_id,
          status: "pending",
          trigger_reason: `Humanness: ${humanness_score ?? "N/A"}, Knowledge gaps: ${knowledge_gaps.length}`,
          proposed_queries: searchQueries,
          humanness_score,
          knowledge_gaps,
        })
        .select("id")
        .single();

      if (reqErr) throw reqErr;

      console.log(`[research-and-improve] Research request ${request.id} created — awaiting creator approval`);

      return new Response(JSON.stringify({
        status: "pending_approval",
        request_id: request.id,
        message: "Research request created. Agent creator must approve before research runs."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: EXECUTE — Run approved research ──
    if (mode === "execute") {
      if (!request_id) throw new Error("request_id required for execute mode");

      const { data: request } = await supabase
        .from("research_requests")
        .select("*")
        .eq("id", request_id)
        .eq("status", "approved")
        .single();

      if (!request) {
        return new Response(JSON.stringify({
          error: "Research request not found or not approved"
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch spec for this project
      const { data: currentSpec } = await supabase
        .from("agent_specs")
        .select("*")
        .eq("project_id", project_id)
        .single();

      const queries = (request.proposed_queries || []) as { query: string; category: string }[];
      const { entries, allResults } = await executeResearch(supabase, project_id, queries, currentSpec);

      const entriesSaved = await saveKnowledge(supabase, project_id, entries, allResults, currentSpec);

      // Mark as completed
      await supabase
        .from("research_requests")
        .update({
          status: "completed",
          results: { entries_saved: entriesSaved, entries },
          completed_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(JSON.stringify({
        status: "completed",
        entries_saved: entriesSaved,
        research_notes: entries.map((e: any) => e.content),
        sources: allResults.map((r: any) => r.url).filter(Boolean),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LEGACY MODE (no mode specified) — backward compat, direct execution ──
    const searchQueries = generateSearchQueries(spec, evaluation);
    console.log("Research queries:", searchQueries.map(q => q.query));

    const { entries, allResults } = await executeResearch(supabase, project_id, searchQueries, spec);

    if (entries.length === 0) {
      return new Response(JSON.stringify({ research_notes: [], sources: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entriesSaved = await saveKnowledge(supabase, project_id, entries, allResults, spec);

    return new Response(JSON.stringify({
      research_notes: entries.map((e: any) => e.content),
      sources: allResults.map((r: any) => r.url).filter(Boolean),
      entries_saved: entriesSaved,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("research-and-improve error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
