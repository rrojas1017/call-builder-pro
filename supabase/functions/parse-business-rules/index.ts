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
    const { file_path, text } = await req.json();
    if (!file_path && !text) throw new Error("file_path or text required");

    let rawText = text || "";

    if (file_path) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data: fileData, error: fileErr } = await supabase.storage
        .from("agent_knowledge_sources")
        .download(file_path);
      if (fileErr) throw fileErr;

      rawText = await fileData.text();
    }

    if (!rawText.trim()) throw new Error("No text content found in document");

    const truncated = rawText.slice(0, 30000);

    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You extract individual business rules from documents for an AI calling agent.
Each rule should be a single, actionable directive — something the agent must do or must not do during a call.
Combine related sub-points into one rule when they belong together.
Strip out headers, numbering, and formatting — just the rule text.

Return ONLY a JSON array of strings. No markdown fences, no explanation.
Example: ["If caller has Medicaid, do not transfer", "Always confirm caller's age before proceeding"]`,
        },
        {
          role: "user",
          content: `Extract business rules from this document:\n\n${truncated}`,
        },
      ],
    });

    let rules: string[] = [];
    try {
      const raw = (aiResponse.content || "").trim();
      const cleaned = raw
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      rules = JSON.parse(cleaned);
      if (!Array.isArray(rules)) rules = [];
      rules = rules.filter((r) => typeof r === "string" && r.trim().length > 0);
    } catch {
      throw new Error("Failed to parse AI response into rules");
    }

    return new Response(JSON.stringify({ rules }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("parse-business-rules error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
