import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PHONE_HEADERS = ["phone", "phone_number", "mobile", "cell", "telephone", "phone number", "tel", "contact_number"];
const NAME_HEADERS = ["name", "full_name", "first_name", "contact", "contact_name", "fullname", "customer"];

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectColumns(headers: string[], dataRows: string[][]): { phone_column: string; name_column: string } {
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  let phone_column = "";
  let name_column = "";

  for (let i = 0; i < lower.length; i++) {
    if (!phone_column && PHONE_HEADERS.some((p) => lower[i].includes(p.replace(/\s/g, "_")))) {
      phone_column = headers[i];
    }
    if (!name_column && NAME_HEADERS.some((n) => lower[i].includes(n.replace(/\s/g, "_")))) {
      name_column = headers[i];
    }
  }

  // Fallback: scan data to find phone-like column
  if (!phone_column && dataRows.length > 0) {
    for (let col = 0; col < headers.length; col++) {
      const phoneCount = dataRows.filter((r) => r[col] && looksLikePhone(r[col])).length;
      if (phoneCount >= Math.min(3, dataRows.length) * 0.6) {
        phone_column = headers[col];
        break;
      }
    }
  }

  if (!name_column && headers.length > 0) {
    // Pick first non-phone text column
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] !== phone_column) {
        name_column = headers[i];
        break;
      }
    }
  }

  return { phone_column, name_column };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_content } = await req.json();

    const text = file_content.includes(",") ? file_content : atob(file_content);
    const lines = text.trim().split("\n").filter((l: string) => l.trim());

    if (lines.length === 0) {
      return new Response(JSON.stringify({ error: "Empty file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headerParts = parseCSVLine(lines[0]);
    const dataLines = lines.slice(1);
    const dataRows = dataLines.map((l: string) => parseCSVLine(l));

    // Check if first row looks like a header (non-numeric, non-phone values)
    const firstRowLooksLikeHeader = headerParts.every((v) => !looksLikePhone(v));

    let detected_fields: string[];
    let rows: Record<string, string>[];

    if (firstRowLooksLikeHeader) {
      detected_fields = headerParts;
      rows = dataRows.map((parts) => {
        const obj: Record<string, string> = {};
        detected_fields.forEach((field, i) => {
          obj[field] = parts[i] || "";
        });
        return obj;
      });
    } else {
      // No header — generate generic column names
      detected_fields = headerParts.map((_, i) => `column_${i + 1}`);
      const allRows = [headerParts, ...dataRows];
      rows = allRows.map((parts) => {
        const obj: Record<string, string> = {};
        detected_fields.forEach((field, i) => {
          obj[field] = parts[i] || "";
        });
        return obj;
      });
    }

    const sampleData = dataRows.length > 0 ? dataRows : [headerParts];
    const { phone_column, name_column } = detectColumns(detected_fields, sampleData);

    return new Response(
      JSON.stringify({
        detected_fields,
        phone_column,
        name_column,
        rows,
        count: rows.length,
        preview: rows.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("parse-dial-list error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
