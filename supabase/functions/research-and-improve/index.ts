import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, evaluation, spec } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const useCase = spec?.use_case || "phone sales";
    const issues = evaluation?.issues_detected || [];
    const suggestions = evaluation?.humanness_suggestions || [];
    const knowledgeGaps = evaluation?.knowledge_gaps || [];
    const gaps = [...issues, ...suggestions].slice(0, 5);

    // Build domain-aware queries across multiple categories
    const queries: { query: string; category: string }[] = [
      // Conversation techniques
      { query: `best natural conversation techniques for ${useCase} phone calls`, category: "conversation_technique" },
      // Product/industry knowledge
      { query: `${useCase} key product knowledge facts for sales agents 2026`, category: "product_knowledge" },
      // Objection handling
      { query: `common objections in ${useCase} and how to handle them naturally`, category: "objection_handling" },
    ];

    // Add gap-specific queries
    if (gaps.length > 0) {
      queries.push({ query: `how to ${gaps[0].toLowerCase()} on phone calls naturally`, category: "conversation_technique" });
    }

    // Add knowledge-gap-specific queries
    for (const gap of knowledgeGaps.slice(0, 2)) {
      queries.push({ query: `${useCase} ${gap}`, category: "product_knowledge" });
    }

    // Industry insights
    queries.push({ query: `${useCase} industry trends and competitor comparison 2026`, category: "industry_insight" });

    const searchQueries = queries.slice(0, 6);
    console.log("Research queries:", searchQueries.map(q => q.query));

    // Search via Firecrawl
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
      console.log("No research results found");
      return new Response(JSON.stringify({ research_notes: [], sources: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${allResults.length} articles, distilling...`);

    // Distill with AI — now categorized
    const researchContext = allResults
      .map((r, i) => `Article ${i + 1} [${r.category}] (${r.title}):\n${r.markdown}`)
      .join("\n\n---\n\n");

    const distillPrompt = `You are a domain expert and conversation coach. The AI phone agent works in: ${useCase}

Agent weaknesses:
${gaps.map(g => `- ${g}`).join("\n") || "- General improvement needed"}

Knowledge gaps detected:
${knowledgeGaps.map((g: string) => `- ${g}`).join("\n") || "- None specifically flagged"}

Below are articles. Distill them into categorized knowledge entries.

For each entry, provide:
- "category": one of "conversation_technique", "product_knowledge", "objection_handling", "industry_insight", "competitor_info"
- "content": a specific, actionable piece of knowledge with example phrases where applicable
- "source_url": the article URL it came from

Rules:
- Be concrete: give example phrases for conversation techniques, specific facts for product knowledge
- Each entry should be self-contained and useful on its own
- Return 5-10 entries across multiple categories
- Prioritize filling the knowledge gaps listed above

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
      return new Response(JSON.stringify({ research_notes: [], sources: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Save to agent_knowledge table (dedup by content similarity)
    const { data: existingKnowledge } = await supabase
      .from("agent_knowledge")
      .select("content")
      .eq("project_id", project_id);

    const existingContents = new Set((existingKnowledge || []).map((k: any) => k.content.toLowerCase().trim()));

    const newEntries = entries.filter(
      (e) => !existingContents.has(e.content.toLowerCase().trim())
    );

    if (newEntries.length > 0) {
      const rows = newEntries.map((e) => ({
        project_id,
        category: e.category,
        content: e.content,
        source_url: e.source_url || null,
        source_type: "auto_research",
      }));

      const { error: insertErr } = await supabase.from("agent_knowledge").insert(rows);
      if (insertErr) console.error("Failed to insert knowledge:", insertErr);
      else console.log(`Saved ${newEntries.length} new knowledge entries`);
    }

    // Also continue merging conversation techniques into humanization_notes for backward compat
    const conversationTechniques = entries
      .filter((e) => e.category === "conversation_technique")
      .map((e) => e.content);

    const currentNotes: string[] = Array.isArray(spec?.humanization_notes) ? spec.humanization_notes : [];
    const newTechniques = conversationTechniques.filter(
      (t) => !currentNotes.some((existing: string) => existing.toLowerCase() === t.toLowerCase())
    );

    if (newTechniques.length > 0) {
      const merged = [...currentNotes, ...newTechniques].slice(-20);
      const sources = allResults.map((r) => r.url).filter(Boolean);
      const currentSources: string[] = Array.isArray(spec?.research_sources) ? spec.research_sources : [];
      const mergedSources = [...new Set([...currentSources, ...sources])].slice(-30);

      await supabase
        .from("agent_specs")
        .update({ humanization_notes: merged, research_sources: mergedSources })
        .eq("project_id", project_id);

      console.log(`Merged ${newTechniques.length} conversation techniques into humanization_notes`);
    }

    return new Response(JSON.stringify({
      research_notes: entries.map((e) => e.content),
      sources: allResults.map((r) => r.url).filter(Boolean),
      entries_saved: newEntries.length,
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
