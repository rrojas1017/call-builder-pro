import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, file_path, url } = await req.json();
    if (!project_id) throw new Error("project_id required");
    if (!file_path && !url) throw new Error("file_path or url required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let rawText = "";
    let sourceType = "document";
    let sourceUrl: string | null = null;

    if (url) {
      // Fetch URL content
      sourceType = "url";
      sourceUrl = url;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Appendify-Bot/1.0" },
      });
      if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
      const html = await resp.text();
      // Strip HTML tags for plain text extraction
      rawText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } else if (file_path) {
      // Download from storage
      sourceType = "document";
      const { data: fileData, error: fileErr } = await supabase.storage
        .from("agent_knowledge_sources")
        .download(file_path);
      if (fileErr) throw fileErr;

      const fileName = file_path.toLowerCase();
      if (
        fileName.endsWith(".txt") ||
        fileName.endsWith(".csv") ||
        fileName.endsWith(".md")
      ) {
        rawText = await fileData.text();
      } else {
        // For PDF, XLSX, etc. — read as text best-effort
        rawText = await fileData.text();
      }

      // Build a public URL for source reference
      const { data: urlData } = supabase.storage
        .from("agent_knowledge_sources")
        .getPublicUrl(file_path);
      sourceUrl = urlData?.publicUrl || null;
    }

    if (!rawText.trim()) throw new Error("Could not extract text content");

    // Truncate to ~30k chars to stay within token limits
    const truncated = rawText.slice(0, 30000);

    // Use AI to split into categorized knowledge entries
    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You extract structured knowledge from documents for an AI calling agent.
Split the content into distinct knowledge entries. Each entry should be a focused, self-contained piece of information.

Return a JSON array where each item has:
- "category": one of "product_knowledge", "objection_handling", "conversation_technique", "industry_insight", "competitor_info"
- "content": the knowledge text (2-4 sentences, clear and actionable)

Return ONLY the JSON array, no markdown fences. Aim for 3-15 entries depending on document length.`,
        },
        {
          role: "user",
          content: `Extract knowledge entries from this content:\n\n${truncated}`,
        },
      ],
    });

    let entries: { category: string; content: string }[] = [];
    try {
      const text = (aiResponse.content || "").trim();
      // Strip markdown fences if present
      const cleaned = text
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      entries = JSON.parse(cleaned);
    } catch {
      // Fallback: store as single entry
      entries = [
        {
          category: "product_knowledge",
          content: truncated.slice(0, 2000),
        },
      ];
    }

    // Insert entries into agent_knowledge
    const rows = entries.map((e) => ({
      project_id,
      category: e.category || "product_knowledge",
      content: e.content,
      source_type: sourceType,
      source_url: sourceUrl,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("agent_knowledge")
      .insert(rows)
      .select();
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ entries: inserted, count: inserted?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ingest-knowledge-source error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
