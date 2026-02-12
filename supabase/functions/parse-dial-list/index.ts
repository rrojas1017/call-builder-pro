import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const cleaned = digits.startsWith("+") ? digits : digits.replace(/\D/g, "");
  
  if (cleaned.startsWith("+") && cleaned.length >= 11 && cleaned.length <= 16) return cleaned;
  
  const justDigits = cleaned.replace(/\D/g, "");
  if (justDigits.length === 10) return `+1${justDigits}`;
  if (justDigits.length === 11 && justDigits.startsWith("1")) return `+${justDigits}`;
  if (justDigits.length >= 11 && justDigits.length <= 15) return `+${justDigits}`;
  
  return null;
}

function parseCSV(text: string): { name: string; phone: string }[] {
  const lines = text.trim().split("\n");
  const results: { name: string; phone: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const parts = trimmed.split(",").map((s) => s.trim());
    if (parts.length < 2) continue;
    
    const name = parts[0];
    const phone = normalizePhone(parts[1]);
    if (phone) results.push({ name, phone });
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_content, file_type } = await req.json();

    let contacts: { name: string; phone: string }[];

    if (file_type === "csv" || !file_type) {
      const text = file_content.includes(",") ? file_content : atob(file_content);
      contacts = parseCSV(text);
    } else {
      return new Response(JSON.stringify({ error: "Only CSV is supported currently" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ contacts, count: contacts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-dial-list error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
