import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractByPath(obj: any, path: string | null): any {
  if (!path) return obj;
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, caller_context } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: endpoints, error } = await supabase
      .from("knowledge_api_endpoints")
      .select("*")
      .eq("project_id", project_id)
      .eq("enabled", true);

    if (error) throw error;
    if (!endpoints || endpoints.length === 0) {
      return new Response(JSON.stringify({ api_data: "", endpoints_queried: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Substitute placeholders in query_template
        let body: string | undefined;
        if (ep.query_template) {
          body = ep.query_template
            .replace(/\{\{caller_name\}\}/g, caller_context?.name || "")
            .replace(/\{\{phone\}\}/g, caller_context?.phone || "");
        }

        const fetchOptions: RequestInit = {
          method: ep.http_method || "GET",
          headers: {
            "Content-Type": "application/json",
            ...(ep.headers || {}),
          },
          signal: controller.signal,
        };

        if (ep.http_method === "POST" && body) {
          fetchOptions.body = body;
        }

        const resp = await fetch(ep.endpoint_url, fetchOptions);
        clearTimeout(timeout);

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`API endpoint ${ep.name} returned ${resp.status}: ${errText}`);
          await supabase.from("knowledge_api_endpoints").update({
            last_synced_at: new Date().toISOString(),
            last_status: `error:${resp.status}`,
          }).eq("id", ep.id);
          continue;
        }

        const data = await resp.json();
        const extracted = extractByPath(data, ep.response_path);
        const text = typeof extracted === "string" ? extracted : JSON.stringify(extracted, null, 2);

        // Truncate to 2000 chars per endpoint
        const truncated = text.length > 2000 ? text.substring(0, 2000) : text;
        results.push(`[api_source: ${ep.name}] ${truncated}`);

        await supabase.from("knowledge_api_endpoints").update({
          last_synced_at: new Date().toISOString(),
          last_status: "ok",
        }).eq("id", ep.id);

      } catch (epErr: any) {
        console.error(`API endpoint ${ep.name} failed:`, epErr.message);
        await supabase.from("knowledge_api_endpoints").update({
          last_synced_at: new Date().toISOString(),
          last_status: `error:${epErr.message?.substring(0, 100)}`,
        }).eq("id", ep.id);
      }
    }

    const apiData = results.join("\n");

    return new Response(JSON.stringify({
      api_data: apiData,
      endpoints_queried: endpoints.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("fetch-api-knowledge error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
