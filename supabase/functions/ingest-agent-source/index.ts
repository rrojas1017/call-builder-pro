import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        // For PDF/DOCX, just note the upload — full extraction would need a parser
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
