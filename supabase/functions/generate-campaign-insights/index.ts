const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callAI } from "../_shared/ai-client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { org_id, date_range } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Calculate date cutoff
    let dateCutoff: string | null = null;
    if (date_range && date_range !== "all") {
      const days = date_range === "7d" ? 7 : date_range === "30d" ? 30 : 90;
      const d = new Date();
      d.setDate(d.getDate() - days);
      dateCutoff = d.toISOString();
    }

    // Fetch campaigns
    const { data: campaigns } = await sb
      .from("campaigns")
      .select("id, name, short_id, status, project_id")
      .eq("project_id", org_id); // We need campaigns by org
    // Actually campaigns don't have org_id, they go through agent_projects
    const { data: agentProjects } = await sb
      .from("agent_projects")
      .select("id, name")
      .eq("org_id", org_id);
    const agentIds = (agentProjects || []).map((a: any) => a.id);

    const { data: allCampaigns } = await sb
      .from("campaigns")
      .select("id, name, short_id, status, project_id")
      .in("project_id", agentIds.length > 0 ? agentIds : ["__none__"]);

    // Fetch calls
    let callsQuery = sb
      .from("calls")
      .select("id, campaign_id, project_id, outcome, duration_seconds, cost_estimate_usd, created_at")
      .eq("org_id", org_id);
    if (dateCutoff) {
      callsQuery = callsQuery.gte("created_at", dateCutoff);
    }
    const { data: calls } = await callsQuery;

    // Fetch lists
    const { data: lists } = await sb.from("dial_lists").select("id, name, short_id, row_count").eq("org_id", org_id);

    // Aggregate stats
    const totalCalls = (calls || []).length;
    const qualified = (calls || []).filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
    const totalCost = (calls || []).reduce((s: number, c: any) => s + (c.cost_estimate_usd || 0), 0);
    const avgDuration = totalCalls > 0
      ? (calls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / totalCalls
      : 0;

    // Per-campaign breakdown
    const campaignBreakdown = (allCampaigns || []).map((camp: any) => {
      const cc = (calls || []).filter((c: any) => c.campaign_id === camp.id);
      const q = cc.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
      const dnc = cc.filter((c: any) => c.outcome === "dnc").length;
      return {
        name: camp.name,
        calls: cc.length,
        qualified: q,
        dnc,
        qualRate: cc.length > 0 ? ((q / cc.length) * 100).toFixed(1) + "%" : "0%",
      };
    }).filter((c: any) => c.calls > 0);

    // Per-agent breakdown
    const agentBreakdown = (agentProjects || []).map((agent: any) => {
      const ac = (calls || []).filter((c: any) => c.project_id === agent.id);
      const q = ac.filter((c: any) => c.outcome === "qualified" || c.outcome === "transfer_completed").length;
      const ad = ac.length > 0 ? ac.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / ac.length : 0;
      return {
        name: agent.name,
        calls: ac.length,
        qualified: q,
        qualRate: ac.length > 0 ? ((q / ac.length) * 100).toFixed(1) + "%" : "0%",
        avgDuration: Math.round(ad),
      };
    }).filter((a: any) => a.calls > 0);

    // Outcome distribution
    const outcomes: Record<string, number> = {};
    (calls || []).forEach((c: any) => {
      if (c.outcome) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
    });

    const prompt = `You are an expert outbound call center analyst. Analyze the following performance data and provide 3-5 actionable insights to improve future campaigns.

DATA SUMMARY:
- Total calls: ${totalCalls}
- Qualified leads: ${qualified} (${totalCalls > 0 ? ((qualified / totalCalls) * 100).toFixed(1) : 0}%)
- Total cost: $${totalCost.toFixed(2)}
- Average call duration: ${Math.round(avgDuration)}s

OUTCOME DISTRIBUTION:
${JSON.stringify(outcomes, null, 2)}

CAMPAIGN BREAKDOWN:
${JSON.stringify(campaignBreakdown, null, 2)}

AGENT BREAKDOWN:
${JSON.stringify(agentBreakdown, null, 2)}

LISTS: ${(lists || []).length} lists with total ${(lists || []).reduce((s: number, l: any) => s + l.row_count, 0)} rows

Respond ONLY with a JSON array of insight objects. Each object must have:
- "title": short headline (max 10 words)
- "description": 1-2 sentence actionable recommendation
- "category": one of "Performance", "Cost", "Strategy", "Agent", "List Quality"

Example: [{"title":"Focus on 407 area codes","description":"Contacts from 407 area codes convert 2x better. Prioritize list acquisition in this region.","category":"List Quality"}]`;

    const result = await callAI({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2048,
    });

    let insights: any[] = [];
    try {
      const text = result.content || "[]";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      }
    } catch {
      insights = [{ title: "Analysis complete", description: result.content || "No insights generated", category: "General" }];
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
