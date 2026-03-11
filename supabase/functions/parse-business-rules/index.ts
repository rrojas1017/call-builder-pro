import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You extract individual business rules from documents for an AI calling agent.
Each rule should be a single, actionable directive — something the agent must do or must not do during a call.
Combine related sub-points into one rule when they belong together.
Strip out headers, numbering, and formatting — just the rule text.

Return ONLY a JSON array of strings. No markdown fences, no explanation.
Example: ["If caller has Medicaid, do not transfer", "Always confirm caller's age before proceeding"]`;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, text } = await req.json();
    if (!file_path && !text) throw new Error("file_path or text required");

    let rules: string[] = [];

    if (text) {
      // Plain text passed directly — use callAI as before
      const truncated = text.trim().slice(0, 30000);
      if (!truncated) throw new Error("No text content provided");
      rules = await extractRulesFromText(truncated);
    } else if (file_path) {
      const fileName = file_path.toLowerCase();

      // Reject legacy .doc
      if (fileName.endsWith(".doc") && !fileName.endsWith(".docx")) {
        throw new Error(
          "Legacy .doc format is not supported. Please convert to .docx or .txt and try again."
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data: fileData, error: fileErr } = await supabase.storage
        .from("agent_knowledge_sources")
        .download(file_path);
      if (fileErr) throw fileErr;

      const isPlainText =
        fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv");

      if (isPlainText) {
        const rawText = await fileData.text();
        if (!rawText.trim()) throw new Error("No text content found in document");
        const truncated = rawText.slice(0, 30000);
        rules = await extractRulesFromText(truncated);
      } else {
        // PDF or DOCX — send as base64 to Gemini multimodal
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        if (bytes.length === 0) throw new Error("Uploaded file is empty");

        const base64 = uint8ArrayToBase64(bytes);
        const mimeType = fileName.endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        rules = await extractRulesFromBinary(base64, mimeType);
      }
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

// ── Extract rules from plain text via callAI ──
async function extractRulesFromText(text: string): Promise<string[]> {
  const aiResponse = await callAI({
    provider: "gemini",
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Extract business rules from this document:\n\n${text}` },
    ],
  });

  return parseRulesJson(aiResponse.content || "");
}

// ── Extract rules from binary (PDF/DOCX) via Gemini multimodal ──
async function extractRulesFromBinary(
  base64Data: string,
  mimeType: string
): Promise<string[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  // Use OpenAI-compatible multimodal format with the Lovable gateway
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.1,
      max_tokens: 4096,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
            {
              type: "text",
              text: "Extract business rules from this document.",
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI gateway error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseRulesJson(content);
}

// ── Parse AI response into string array ──
function parseRulesJson(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    let rules = JSON.parse(cleaned);
    if (!Array.isArray(rules)) rules = [];
    return rules.filter((r: any) => typeof r === "string" && r.trim().length > 0);
  } catch {
    throw new Error("Failed to parse AI response into rules");
  }
}

// ── Base64 encoding for Uint8Array ──
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
