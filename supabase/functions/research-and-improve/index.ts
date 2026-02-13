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

    // Build search queries from evaluation gaps + use case
    const useCase = spec?.use_case || "phone sales";
    const issues = evaluation?.issues_detected || [];
    const suggestions = evaluation?.humanness_suggestions || [];
    const gaps = [...issues, ...suggestions].slice(0, 5);

    const queries = [
      `best natural conversation techniques for ${useCase} phone calls`,
      ...(gaps.length > 0
        ? [`how to ${gaps[0].toLowerCase()} on phone calls naturally`]
        : []),
      ...(gaps.length > 1
        ? [`${useCase} ${gaps[1].toLowerCase()} best practices`]
        : []),
    ].slice(0, 3);

    console.log("Research queries:", queries);

    // Search via Firecrawl
    const allResults: { title: string; url: string; markdown: string }[] = [];

    for (const query of queries) {
      try {
        const resp = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            limit: 3,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const results = data.data || [];
          for (const r of results) {
            if (r.markdown || r.description) {
              allResults.push({
                title: r.title || r.url || "",
                url: r.url || "",
                markdown: (r.markdown || r.description || "").slice(0, 2000),
              });
            }
          }
        } else {
          console.error("Firecrawl search failed:", resp.status, await resp.text());
        }
      } catch (e) {
        console.error("Firecrawl search error for query:", query, e);
      }
    }

    if (allResults.length === 0) {
      console.log("No research results found");
      return new Response(JSON.stringify({ research_notes: [], sources: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${allResults.length} articles, distilling...`);

    // Distill with AI
    const researchContext = allResults
      .map((r, i) => `Article ${i + 1} (${r.title}):\n${r.markdown}`)
      .join("\n\n---\n\n");

    const distillPrompt = `You are a conversation coaching expert. The AI phone agent has these weaknesses:
${gaps.map((g) => `- ${g}`).join("\n")}

Use case: ${useCase}

Below are articles with relevant techniques. Distill them into 3-5 SPECIFIC, ACTIONABLE conversation techniques this agent should use on its next call. 

Rules:
- Be concrete: give example phrases the agent should actually say, not abstract advice
- Each technique should be one clear sentence with an example
- Focus on what makes phone conversations feel natural and human
- Prioritize techniques that address the specific weaknesses listed above

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
          { role: "system", content: "You extract actionable conversation techniques from articles." },
          { role: "user", content: distillPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_techniques",
            description: "Return distilled conversation techniques and their sources.",
            parameters: {
              type: "object",
              properties: {
                techniques: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 specific, actionable conversation techniques with example phrases",
                },
              },
              required: ["techniques"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_techniques" } },
      }),
    });

    if (!aiResp.ok) {
      console.error("AI distillation failed:", aiResp.status, await aiResp.text());
      return new Response(JSON.stringify({ research_notes: [], sources: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    let techniques: string[] = [];

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      techniques = parsed.techniques || [];
    }

    const sources = allResults.map((r) => r.url).filter(Boolean);

    // Merge into humanization_notes
    const currentNotes: string[] = Array.isArray(spec?.humanization_notes) ? spec.humanization_notes : [];
    const newTechniques = techniques.filter(
      (t: string) => !currentNotes.some((existing: string) => existing.toLowerCase() === t.toLowerCase())
    );

    if (newTechniques.length > 0) {
      const merged = [...currentNotes, ...newTechniques].slice(-20);

      // Also merge sources
      const currentSources: string[] = Array.isArray(spec?.research_sources) ? spec.research_sources : [];
      const mergedSources = [...new Set([...currentSources, ...sources])].slice(-30);

      await supabase
        .from("agent_specs")
        .update({
          humanization_notes: merged,
          research_sources: mergedSources,
        })
        .eq("project_id", project_id);

      console.log(`Merged ${newTechniques.length} research techniques, ${sources.length} sources`);
    }

    return new Response(JSON.stringify({ research_notes: techniques, sources }), {
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
