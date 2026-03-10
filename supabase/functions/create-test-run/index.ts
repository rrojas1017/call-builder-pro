import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, requireAuth, requireOrgAccess, AuthError, unauthorizedResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let auth;
    try { auth = await requireAuth(req); } catch (e) {
      if (e instanceof AuthError) return unauthorizedResponse(e.message);
      throw e;
    }
    console.log(`[create-test-run] Authenticated user=${auth.userId} org=${auth.orgId}`);

    const { project_id, name, max_calls = 5, concurrency = 1, contacts, agent_instructions_text } = await req.json();
    if (!project_id || !contacts?.length) throw new Error("project_id and contacts required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get org_id from project
    const { data: project, error: projErr } = await supabase
      .from("agent_projects")
      .select("org_id")
      .eq("id", project_id)
      .single();
    if (projErr) throw projErr;

    // Verify org access
    requireOrgAccess(auth, project.org_id);

    // Get current spec version
    const { data: spec } = await supabase
      .from("agent_specs")
      .select("version")
      .eq("project_id", project_id)
      .single();

    const { data: testRun, error: trErr } = await supabase
      .from("test_runs")
      .insert({
        project_id,
        org_id: project.org_id,
        name,
        max_calls,
        concurrency,
        agent_instructions_text: agent_instructions_text || null,
        spec_version: spec?.version || 1,
        status: "draft",
      })
      .select("id")
      .single();
    if (trErr) throw trErr;

    // Insert contacts (limited to max_calls)
    const limitedContacts = contacts.slice(0, max_calls).map((c: any) => ({
      test_run_id: testRun.id,
      name: c.name,
      phone: c.phone,
      status: "queued",
    }));

    const { error: cErr } = await supabase.from("test_run_contacts").insert(limitedContacts);
    if (cErr) throw cErr;

    return new Response(JSON.stringify({ test_run_id: testRun.id, contacts_count: limitedContacts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-test-run error:", err);
    if (err instanceof AuthError) return unauthorizedResponse(err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
