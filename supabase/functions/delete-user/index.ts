import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's org
    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user_id)
      .single();

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.org_id;

    // Check if sole member
    const { count } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    const isSoleMember = (count ?? 0) <= 1;

    if (isSoleMember) {
      console.log(`User is sole member of org ${orgId}, cleaning up org data...`);

      // Get agent project IDs for this org
      const { data: projects } = await adminClient
        .from("agent_projects")
        .select("id")
        .eq("org_id", orgId);
      const projectIds = (projects ?? []).map((p) => p.id);

      if (projectIds.length > 0) {
        // Delete test_run_contacts via test_runs
        const { data: testRuns } = await adminClient
          .from("test_runs")
          .select("id")
          .eq("org_id", orgId);
        const trIds = (testRuns ?? []).map((t) => t.id);
        if (trIds.length > 0) {
          await adminClient.from("test_run_contacts").delete().in("test_run_id", trIds);
        }

        // Delete test_runs
        await adminClient.from("test_runs").delete().eq("org_id", orgId);

        // Get campaign IDs
        const { data: campaigns } = await adminClient
          .from("campaigns")
          .select("id")
          .in("project_id", projectIds);
        const campaignIds = (campaigns ?? []).map((c) => c.id);

        if (campaignIds.length > 0) {
          await adminClient.from("contacts").delete().in("campaign_id", campaignIds);
          await adminClient.from("campaign_lists").delete().in("campaign_id", campaignIds);
        }

        // Nullify inbound_numbers project refs, then delete
        await adminClient.from("inbound_numbers").delete().eq("org_id", orgId);

        // Delete calls
        await adminClient.from("calls").delete().eq("org_id", orgId);

        // Delete campaigns (nullify agent_project_id first not needed since we delete by project_id)
        if (campaignIds.length > 0) {
          await adminClient.from("campaigns").delete().in("id", campaignIds);
        }

        // Delete evaluations via calls (already deleted calls, evaluations have cascade? No, let's check)
        // evaluations FK to calls with no cascade, but we already deleted calls so orphaned evals would fail
        // Actually we need to delete evaluations BEFORE calls
        // Let me restructure...
      }

      // Let me redo this in proper order to respect FK constraints:
      // 1. evaluations (FK to calls)
      const { data: callIds } = await adminClient
        .from("calls")
        .select("id")
        .eq("org_id", orgId);
      if (callIds && callIds.length > 0) {
        await adminClient.from("evaluations").delete().in("call_id", callIds.map(c => c.id));
      }

      // 2. test_run_contacts (FK to test_runs)
      const { data: trIds2 } = await adminClient
        .from("test_runs")
        .select("id")
        .eq("org_id", orgId);
      if (trIds2 && trIds2.length > 0) {
        await adminClient.from("test_run_contacts").delete().in("test_run_id", trIds2.map(t => t.id));
      }

      // 3. test_runs
      await adminClient.from("test_runs").delete().eq("org_id", orgId);

      // 4. contacts, campaign_lists (FK to campaigns)
      if (projectIds.length > 0) {
        const { data: camps } = await adminClient
          .from("campaigns")
          .select("id")
          .in("project_id", projectIds);
        const cIds = (camps ?? []).map(c => c.id);
        if (cIds.length > 0) {
          await adminClient.from("contacts").delete().in("campaign_id", cIds);
          await adminClient.from("campaign_lists").delete().in("campaign_id", cIds);
        }
        await adminClient.from("campaigns").delete().in("project_id", projectIds);
      }

      // 5. calls
      await adminClient.from("calls").delete().eq("org_id", orgId);

      // 6. sms_messages (FK to sms_conversations)
      const { data: convos } = await adminClient
        .from("sms_conversations")
        .select("id")
        .eq("org_id", orgId);
      if (convos && convos.length > 0) {
        await adminClient.from("sms_messages").delete().in("conversation_id", convos.map(c => c.id));
      }
      await adminClient.from("sms_conversations").delete().eq("org_id", orgId);

      // 7. Other org-level tables
      await adminClient.from("inbound_numbers").delete().eq("org_id", orgId);
      await adminClient.from("credit_transactions").delete().eq("org_id", orgId);
      await adminClient.from("org_invitations").delete().eq("org_id", orgId);

      // 8. dial_list_rows (FK to dial_lists)
      const { data: lists } = await adminClient
        .from("dial_lists")
        .select("id")
        .eq("org_id", orgId);
      if (lists && lists.length > 0) {
        await adminClient.from("dial_list_rows").delete().in("list_id", lists.map(l => l.id));
      }
      await adminClient.from("dial_lists").delete().eq("org_id", orgId);

      // 9. Agent project sub-tables
      if (projectIds.length > 0) {
        await adminClient.from("wizard_questions").delete().in("project_id", projectIds);
        await adminClient.from("agent_knowledge").delete().in("project_id", projectIds);
        await adminClient.from("improvements").delete().in("project_id", projectIds);
        await adminClient.from("agent_specs").delete().in("project_id", projectIds);
        await adminClient.from("agent_projects").delete().in("id", projectIds);
      }

      // 10. Delete org
      await adminClient.from("organizations").delete().eq("id", orgId);
      console.log(`Deleted organization ${orgId} and all related data`);
    }

    // Finally delete the auth user (cascades to profiles, user_roles)
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteErr) throw deleteErr;

    console.log(`Successfully deleted user ${user_id}`);

    return new Response(JSON.stringify({ success: true, org_deleted: isSoleMember }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
