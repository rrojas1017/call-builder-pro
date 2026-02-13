import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

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
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] !== phone_column) {
        name_column = headers[i];
        break;
      }
    }
  }

  return { phone_column, name_column };
}

async function analyzeWithAI(headers: string[], sampleRows: string[][]): Promise<{
  suggested_name: string;
  phone_column: string;
  name_column: string;
  field_map: Record<string, string>;
  quality_notes: string[];
} | null> {
  try {
    const sampleData = sampleRows.slice(0, 10).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ""; });
      return obj;
    });

    const response = await callAI({
      provider: "gemini",
      messages: [
        {
          role: "system",
          content: "You are a data analyst. Analyze CSV data and return structured metadata. Be concise."
        },
        {
          role: "user",
          content: `Analyze this CSV data. Headers: ${JSON.stringify(headers)}\n\nSample rows (up to 10):\n${JSON.stringify(sampleData, null, 2)}\n\nCall the analyze_csv tool with your analysis.`
        }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analyze_csv",
            description: "Return structured analysis of the CSV file",
            parameters: {
              type: "object",
              properties: {
                suggested_name: {
                  type: "string",
                  description: "A descriptive list name based on the data content, e.g. 'Texas Health Leads - Feb 2026'. Be creative and specific based on patterns you see in the data (locations, industries, dates, etc.)"
                },
                phone_column: {
                  type: "string",
                  description: "The header name that contains phone numbers"
                },
                name_column: {
                  type: "string",
                  description: "The header name that contains the person/contact name"
                },
                field_map: {
                  type: "object",
                  description: "Maps each CSV header to a semantic role: phone, name, email, state, zip, city, age, company, address, notes, or other",
                  additionalProperties: { type: "string" }
                },
                quality_notes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of data quality observations, e.g. 'Some rows have missing phone numbers', 'Email column has invalid formats'"
                }
              },
              required: ["suggested_name", "phone_column", "name_column", "field_map", "quality_notes"],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "analyze_csv" } },
      temperature: 0.2,
    });

    if (response.tool_calls.length > 0) {
      const args = response.tool_calls[0].arguments as any;
      return {
        suggested_name: args.suggested_name || "",
        phone_column: args.phone_column || "",
        name_column: args.name_column || "",
        field_map: args.field_map || {},
        quality_notes: args.quality_notes || [],
      };
    }
    return null;
  } catch (err) {
    console.error("AI analysis failed, falling back to heuristics:", err);
    return null;
  }
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
    
    // Try AI analysis first
    const aiResult = await analyzeWithAI(detected_fields, sampleData);

    let phone_column: string;
    let name_column: string;
    let suggested_name = "";
    let field_map: Record<string, string> = {};
    let quality_notes: string[] = [];

    if (aiResult) {
      // Validate AI-detected columns exist in headers
      phone_column = detected_fields.includes(aiResult.phone_column) ? aiResult.phone_column : "";
      name_column = detected_fields.includes(aiResult.name_column) ? aiResult.name_column : "";
      suggested_name = aiResult.suggested_name;
      field_map = aiResult.field_map;
      quality_notes = aiResult.quality_notes;
    } else {
      // Fallback to heuristic detection
      const heuristic = detectColumns(detected_fields, sampleData);
      phone_column = heuristic.phone_column;
      name_column = heuristic.name_column;
    }

    // If AI didn't find phone column, try heuristic
    if (!phone_column) {
      const heuristic = detectColumns(detected_fields, sampleData);
      phone_column = heuristic.phone_column;
      if (!name_column) name_column = heuristic.name_column;
    }

    // Count skip rows (no valid phone)
    const phoneIdx = detected_fields.indexOf(phone_column);
    let skip_count = 0;
    if (phoneIdx >= 0) {
      skip_count = rows.filter((r) => {
        const val = r[phone_column] || "";
        return !looksLikePhone(val);
      }).length;
    }
    const valid_count = rows.length - skip_count;

    return new Response(
      JSON.stringify({
        detected_fields,
        phone_column,
        name_column,
        rows,
        count: rows.length,
        preview: rows.slice(0, 5),
        // AI-enhanced fields
        suggested_name,
        field_map,
        quality_notes,
        valid_count,
        skip_count,
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
