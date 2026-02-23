import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, text, file_path } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let sourceText = text || "";

    // If a file was uploaded to storage, download and extract text
    if (file_path) {
      const { data: fileData, error: fileErr } = await supabase.storage
        .from("agent_sources")
        .download(file_path);
      if (fileErr) throw fileErr;

      // Best-effort text extraction
      const fileName = file_path.toLowerCase();
      if (fileName.endsWith(".txt")) {
        sourceText += "\n" + await fileData.text();
      } else if (fileName.endsWith(".pdf") || fileName.endsWith(".docx")) {
        sourceText += `\n[Uploaded file: ${file_path}]`;
      } else {
        sourceText += "\n" + await fileData.text();
      }
    }

    if (!sourceText.trim()) throw new Error("No source text or file provided");

    // Save source_text to project
    const { error: updateErr } = await supabase
      .from("agent_projects")
      .update({ source_text: sourceText })
      .eq("id", project_id);
    if (updateErr) throw updateErr;

    // ── Auto-create knowledge entries from the document ──
    const truncated = sourceText.slice(0, 30000);
    try {
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
        const rawText = (aiResponse.content || "").trim();
        const cleaned = rawText
          .replace(/^```json?\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        entries = JSON.parse(cleaned);
      } catch {
        // Fallback: store as single entry
        entries = [
          { category: "product_knowledge", content: truncated.slice(0, 2000) },
        ];
      }

      if (entries.length > 0) {
        const rows = entries.map((e) => ({
          project_id,
          category: e.category || "product_knowledge",
          content: e.content,
          source_type: "document",
          file_name: file_path ? file_path.split("/").pop() || null : null,
        }));

        const { error: insertErr } = await supabase
          .from("agent_knowledge")
          .insert(rows);
        if (insertErr) {
          console.error("Failed to insert knowledge entries:", insertErr);
        } else {
          console.log(`Created ${rows.length} knowledge entries from uploaded document`);
        }
      }
    } catch (knowledgeErr: any) {
      // Don't fail the whole ingestion if knowledge extraction fails
      console.error("Knowledge extraction failed (non-fatal):", knowledgeErr.message);
    }

    // Call generate-spec
    const genUrl = `${supabaseUrl}/functions/v1/generate-spec`;
    const genResp = await fetch(genUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ project_id }),
    });
    const genData = await genResp.json();
    if (!genResp.ok) throw new Error(genData.error || "generate-spec failed");

    return new Response(JSON.stringify(genData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ingest-agent-source error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
