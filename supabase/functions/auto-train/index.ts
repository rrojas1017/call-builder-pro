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
    console.log(`[auto-train] Authenticated user=${auth.userId} org=${auth.orgId}`);

    const {
      project_id,
      max_rounds = 3,
      calls_per_round = 3,
      contacts,
      auto_apply_severity = ["critical", "important"],
    } = await req.json();

    if (!project_id) throw new Error("project_id required");
    if (!contacts?.length) throw new Error("contacts required (array of {name, phone})");

    const safeMaxRounds = Math.min(Math.max(max_rounds, 1), 10);
    const safeCallsPerRound = Math.min(Math.max(calls_per_round, 1), 10);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Verify project exists and user has org access
    const { data: project, error: projErr } = await sb
      .from("agent_projects")
      .select("id, org_id")
      .eq("id", project_id)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    requireOrgAccess(auth, project.org_id);

    const { data: spec, error: specErr } = await sb
      .from("agent_specs")
      .select("version, project_id")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    const roundResults: any[] = [];
    let previousAvgScore: number | null = null;

    const { data: baselineSnapshot } = await sb
      .from("score_snapshots")
      .select("avg_overall")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (baselineSnapshot?.avg_overall) {
      previousAvgScore = baselineSnapshot.avg_overall;
    }

    for (let round = 1; round <= safeMaxRounds; round++) {
      console.log(`[auto-train] Round ${round}/${safeMaxRounds} for project ${project_id}`);

      // Step 1: Create test run
      const selectedContacts = contacts
        .sort(() => Math.random() - 0.5)
        .slice(0, safeCallsPerRound);

      const createResp = await fetch(`${supabaseUrl}/functions/v1/create-test-run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id,
          name: `Auto-Train Round ${round}`,
          max_calls: safeCallsPerRound,
          concurrency: 1,
          contacts: selectedContacts,
        }),
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        console.error(`[auto-train] Failed to create test run: ${errText}`);
        roundResults.push({ round, status: "error", error: `create-test-run failed: ${errText}` });
        break;
      }

      const { test_run_id } = await createResp.json();
      console.log(`[auto-train] Created test run ${test_run_id}`);

      // Step 2: Wait for calls to complete (poll every 15s, max 5min)
      let allComplete = false;
      const maxWaitMs = 5 * 60 * 1000;
      const pollInterval = 15_000;
      const startTime = Date.now();

      while (!allComplete && Date.now() - startTime < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const { data: runContacts } = await sb
          .from("test_run_contacts")
          .select("status")
          .eq("test_run_id", test_run_id);

        if (!runContacts?.length) continue;

        allComplete = runContacts.every(
          (c: any) => c.status === "completed" || c.status === "failed" || c.status === "error"
        );
      }

      if (!allComplete) {
        console.warn(`[auto-train] Round ${round} timed out waiting for calls`);
        roundResults.push({ round, status: "timeout" });
        continue;
      }

      // Step 3: Get calls and evaluate
      const { data: completedContacts } = await sb
        .from("test_run_contacts")
        .select("id, retell_call_id, status")
        .eq("test_run_id", test_run_id)
        .eq("status", "completed");

      if (!completedContacts?.length) {
        console.warn(`[auto-train] Round ${round} had no completed calls`);
        roundResults.push({ round, status: "no_completed_calls" });
        continue;
      }

      // Find matching calls for evaluation
      const evaluations: any[] = [];
      for (const contact of completedContacts) {
        // Look up the call by retell_call_id or test_run_contact
        const { data: callRow } = await sb
          .from("calls")
          .select("id")
          .eq("project_id", project_id)
          .eq("retell_call_id", contact.retell_call_id)
          .maybeSingle();

        const callId = callRow?.id;
        if (!callId) continue;

        try {
          const evalResp = await fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              call_id: callId,
              test_run_contact_id: contact.id,
            }),
          });
          if (evalResp.ok) {
            const evalData = await evalResp.json();
            evaluations.push(evalData);
          }
        } catch (e) {
          console.error(`[auto-train] Eval failed for call ${callId}:`, e);
        }
      }

      if (!evaluations.length) {
        roundResults.push({ round, status: "no_evaluations" });
        continue;
      }

      // Step 4: Calculate average scores
      const scores = evaluations
        .filter((e) => e.evaluation?.overall_score != null)
        .map((e) => e.evaluation.overall_score);

      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
        : null;

      console.log(`[auto-train] Round ${round} avg score: ${avgScore} (previous: ${previousAvgScore})`);

      // Step 5: Regression rollback check
      if (previousAvgScore !== null && avgScore !== null && avgScore < previousAvgScore - 0.5) {
        console.warn(
          `[auto-train] REGRESSION DETECTED: ${avgScore} < ${previousAvgScore} (threshold -0.5). Rolling back.`
        );

        const { data: lastImprovement } = await sb
          .from("improvements")
          .select("id, from_version, to_version, patch, change_summary")
          .eq("project_id", project_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (lastImprovement?.patch) {
          const { data: currentSpec } = await sb
            .from("agent_specs")
            .select("*")
            .eq("project_id", project_id)
            .single();

          if (currentSpec) {
            const revertVersion = currentSpec.version + 1;

            await sb.from("improvements").insert({
              project_id,
              from_version: currentSpec.version,
              to_version: revertVersion,
              change_summary: `ROLLBACK: Reverted changes from v${lastImprovement.from_version}→v${lastImprovement.to_version} (${lastImprovement.change_summary}) due to score regression ${previousAvgScore}→${avgScore}`,
              patch: { _rollback: true, reverted_improvement_id: lastImprovement.id },
              source_recommendation: "auto-train regression rollback",
            });

            await sb
              .from("agent_specs")
              .update({ version: revertVersion })
              .eq("project_id", project_id);

            roundResults.push({
              round,
              status: "regression_rollback",
              avg_score: avgScore,
              previous_score: previousAvgScore,
              rolled_back: lastImprovement.change_summary,
            });
            continue;
          }
        }

        roundResults.push({
          round,
          status: "regression_detected_no_rollback",
          avg_score: avgScore,
          previous_score: previousAvgScore,
        });
        continue;
      }

      // Step 6: Auto-apply critical/important fixes
      const allRecommendations: any[] = [];
      for (const evalData of evaluations) {
        const recs = evalData.evaluation?.recommended_improvements || [];
        for (const rec of recs) {
          if (auto_apply_severity.includes(rec.severity)) {
            allRecommendations.push(rec);
          }
        }
      }

      const severityRank: Record<string, number> = { critical: 3, important: 2, minor: 1 };
      const deduped = new Map<string, any>();
      for (const rec of allRecommendations) {
        const key = rec.field || rec.reason?.substring(0, 50);
        const existing = deduped.get(key);
        if (!existing || (severityRank[rec.severity] || 0) > (severityRank[existing.severity] || 0)) {
          deduped.set(key, rec);
        }
      }

      const appliedFixes: any[] = [];
      for (const [, rec] of deduped) {
        try {
          const applyResp = await fetch(`${supabaseUrl}/functions/v1/apply-audit-recommendation`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              project_id,
              recommendation: rec.reason || `Change ${rec.field} to improve score`,
              category: "evaluation_loop",
            }),
          });
          if (applyResp.ok) {
            const result = await applyResp.json();
            if (result.success) {
              appliedFixes.push({
                field: rec.field,
                reason: rec.reason,
                severity: rec.severity,
                action: result.action,
              });
            }
          }
        } catch (e) {
          console.error(`[auto-train] Failed to apply fix for ${rec.field}:`, e);
        }
      }

      // Save score snapshot
      const { data: currentSpec } = await sb
        .from("agent_specs")
        .select("version, voice_id")
        .eq("project_id", project_id)
        .single();

      const humanScores = evaluations
        .filter((e) => e.evaluation?.humanness_score != null)
        .map((e) => e.evaluation.humanness_score);
      const natScores = evaluations
        .filter((e) => e.evaluation?.naturalness_score != null)
        .map((e) => e.evaluation.naturalness_score);

      const avgHumanness = humanScores.length > 0
        ? Math.round(humanScores.reduce((a: number, b: number) => a + b, 0) / humanScores.length)
        : null;
      const avgNaturalness = natScores.length > 0
        ? Math.round(natScores.reduce((a: number, b: number) => a + b, 0) / natScores.length)
        : null;

      await sb.from("score_snapshots").insert({
        project_id,
        spec_version: currentSpec?.version || 1,
        voice_id: currentSpec?.voice_id || null,
        avg_overall: avgScore,
        avg_humanness: avgHumanness,
        avg_naturalness: avgNaturalness,
        call_count: scores.length,
      });

      roundResults.push({
        round,
        status: "completed",
        avg_score: avgScore,
        previous_score: previousAvgScore,
        calls_evaluated: evaluations.length,
        fixes_applied: appliedFixes.length,
        fixes: appliedFixes,
      });

      if (avgScore !== null) {
        previousAvgScore = avgScore;
      }

      // Stop early if agent is excellent
      if (avgScore !== null && avgScore >= 9.0) {
        console.log(`[auto-train] Score ${avgScore} >= 9.0, stopping early (agent is excellent)`);
        break;
      }
    }

    return new Response(
      JSON.stringify({
        project_id,
        rounds_completed: roundResults.length,
        results: roundResults,
        final_score: previousAvgScore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[auto-train] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
