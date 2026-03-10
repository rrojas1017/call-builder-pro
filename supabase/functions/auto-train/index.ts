import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * AUTO-TRAIN: Unattended training loop for an agent.
 *
 * Modes:
 *   - "simulate" (default): AI-vs-AI conversations — no phone numbers needed
 *   - "live": Real phone calls via Retell (requires contacts)
 *   - "hybrid": Starts simulated, graduates to live at threshold
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      project_id,
      mode = "simulate",
      max_rounds = 3,
      calls_per_round = 3,
      contacts,
      auto_apply_severity = ["critical", "important"],
      customer_difficulty = "medium",
      hybrid_live_threshold = 7.0,
    } = await req.json();

    if (!project_id) throw new Error("project_id required");
    if (mode === "live" && !contacts?.length) {
      throw new Error("contacts required for live mode (array of {name, phone})");
    }

    const safeMaxRounds = Math.min(Math.max(max_rounds, 1), 10);
    const safeCallsPerRound = Math.min(Math.max(calls_per_round, 1), 10);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Get current spec version
    const { data: spec, error: specErr } = await sb
      .from("agent_specs")
      .select("version, project_id")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    const roundResults: any[] = [];
    let previousAvgScore: number | null = null;
    let currentMode = mode === "hybrid" ? "simulate" : mode;

    // Fetch baseline score
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

    const difficulties = ["easy", "medium", "hard"];

    for (let round = 1; round <= safeMaxRounds; round++) {
      console.log(`[auto-train] Round ${round}/${safeMaxRounds} | mode: ${currentMode} | project: ${project_id}`);

      // ── Hybrid: check if we should switch to live ──
      if (mode === "hybrid" && currentMode === "simulate" && previousAvgScore !== null) {
        if (previousAvgScore >= hybrid_live_threshold) {
          if (!contacts?.length) {
            console.log(`[auto-train] Score ${previousAvgScore} >= ${hybrid_live_threshold} — ready for live, but no contacts. Continuing simulation.`);
          } else {
            console.log(`[auto-train] Score ${previousAvgScore} >= ${hybrid_live_threshold} — GRADUATING to live calls!`);
            currentMode = "live";
          }
        }
      }

      let evaluations: any[] = [];

      if (currentMode === "simulate") {
        evaluations = await runSimulatedRound(
          supabaseUrl, serviceKey, project_id, safeCallsPerRound,
          customer_difficulty === "mixed" ? difficulties[round % difficulties.length] : customer_difficulty,
          round
        );
      } else {
        evaluations = await runLiveRound(supabaseUrl, serviceKey, sb, project_id, contacts, safeCallsPerRound, round);
      }

      if (!evaluations.length) {
        roundResults.push({ round, mode: currentMode, status: "no_evaluations" });
        continue;
      }

      // ── Calculate average scores ──
      const scores = evaluations
        .filter((e) => e.evaluation?.overall_score != null)
        .map((e) => e.evaluation.overall_score);

      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
        : null;

      console.log(`[auto-train] Round ${round} avg score: ${avgScore} (previous: ${previousAvgScore})`);

      // ── Regression rollback check ──
      if (previousAvgScore !== null && avgScore !== null && avgScore < previousAvgScore - 0.5) {
        console.warn(`[auto-train] REGRESSION DETECTED: ${avgScore} < ${previousAvgScore}. Rolling back.`);

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
              change_summary: `ROLLBACK: Reverted v${lastImprovement.from_version}→v${lastImprovement.to_version} (${lastImprovement.change_summary}) due to score regression ${previousAvgScore}→${avgScore}`,
              patch: { _rollback: true, reverted_improvement_id: lastImprovement.id },
              source_recommendation: "auto-train regression rollback",
            });

            await sb.from("agent_specs").update({ version: revertVersion }).eq("project_id", project_id);

            roundResults.push({
              round, mode: currentMode, status: "regression_rollback",
              avg_score: avgScore, previous_score: previousAvgScore,
              rolled_back: lastImprovement.change_summary,
            });
            continue;
          }
        }

        roundResults.push({ round, mode: currentMode, status: "regression_detected_no_rollback", avg_score: avgScore, previous_score: previousAvgScore });
        continue;
      }

      // ── Auto-apply critical/important fixes ──
      const appliedFixes = await applyRecommendations(supabaseUrl, serviceKey, evaluations, project_id, auto_apply_severity);

      // ── Save score snapshot ──
      const { data: currentSpec } = await sb
        .from("agent_specs")
        .select("version, voice_id")
        .eq("project_id", project_id)
        .single();

      const humanScores = evaluations.filter((e) => e.evaluation?.humanness_score != null).map((e) => e.evaluation.humanness_score);
      const natScores = evaluations.filter((e) => e.evaluation?.naturalness_score != null).map((e) => e.evaluation.naturalness_score);

      await sb.from("score_snapshots").insert({
        project_id,
        spec_version: currentSpec?.version || 1,
        voice_id: currentSpec?.voice_id || null,
        avg_overall: avgScore,
        avg_humanness: humanScores.length > 0 ? Math.round(humanScores.reduce((a: number, b: number) => a + b, 0) / humanScores.length) : null,
        avg_naturalness: natScores.length > 0 ? Math.round(natScores.reduce((a: number, b: number) => a + b, 0) / natScores.length) : null,
        call_count: scores.length,
      });

      roundResults.push({
        round, mode: currentMode, status: "completed",
        avg_score: avgScore, previous_score: previousAvgScore,
        calls_evaluated: evaluations.length,
        fixes_applied: appliedFixes.length,
        fixes: appliedFixes,
      });

      if (avgScore !== null) previousAvgScore = avgScore;

      if (avgScore !== null && avgScore >= 9.0) {
        console.log(`[auto-train] Score ${avgScore} >= 9.0, stopping early`);
        break;
      }
    }

    return new Response(
      JSON.stringify({ project_id, mode, rounds_completed: roundResults.length, results: roundResults, final_score: previousAvgScore }),
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

// ═══════════════════════════════════════════════════════════════════
// SIMULATION ROUND
// ═══════════════════════════════════════════════════════════════════

async function runSimulatedRound(
  supabaseUrl: string, serviceKey: string, project_id: string,
  callsPerRound: number, difficulty: string, round: number
): Promise<any[]> {
  const evaluations: any[] = [];

  for (let i = 0; i < callsPerRound; i++) {
    try {
      console.log(`[auto-train] Simulating call ${i + 1}/${callsPerRound} (difficulty: ${difficulty})`);
      const simResp = await fetch(`${supabaseUrl}/functions/v1/simulate-call`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id, customer_difficulty: difficulty, max_turns: 12, simulate_scenario: `Training round ${round}, call ${i + 1}` }),
      });

      if (simResp.ok) {
        const simData = await simResp.json();
        if (simData.evaluation) evaluations.push({ evaluation: simData.evaluation, call_id: simData.call_id });
      } else {
        console.error(`[auto-train] Simulation failed: ${await simResp.text()}`);
      }
    } catch (e) {
      console.error(`[auto-train] Simulation error:`, e);
    }
  }

  return evaluations;
}

// ═══════════════════════════════════════════════════════════════════
// LIVE ROUND
// ═══════════════════════════════════════════════════════════════════

async function runLiveRound(
  supabaseUrl: string, serviceKey: string, sb: any,
  project_id: string, contacts: any[], callsPerRound: number, round: number
): Promise<any[]> {
  const selectedContacts = contacts.sort(() => Math.random() - 0.5).slice(0, callsPerRound);

  const createResp = await fetch(`${supabaseUrl}/functions/v1/create-test-run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project_id, name: `Auto-Train Round ${round} (Live)`, max_calls: callsPerRound, concurrency: 1, contacts: selectedContacts }),
  });

  if (!createResp.ok) {
    console.error(`[auto-train] Failed to create test run: ${await createResp.text()}`);
    return [];
  }

  const { test_run_id } = await createResp.json();
  console.log(`[auto-train] Created live test run ${test_run_id}`);

  // Poll for completion (every 15s, max 5min)
  let allComplete = false;
  const startTime = Date.now();

  while (!allComplete && Date.now() - startTime < 300_000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const { data: runContacts } = await sb.from("test_run_contacts").select("status").eq("test_run_id", test_run_id);
    if (!runContacts?.length) continue;
    allComplete = runContacts.every((c: any) => ["completed", "failed", "error"].includes(c.status));
  }

  if (!allComplete) {
    console.warn(`[auto-train] Live round ${round} timed out`);
    return [];
  }

  const { data: completedContacts } = await sb
    .from("test_run_contacts")
    .select("id, retell_call_id, status")
    .eq("test_run_id", test_run_id)
    .eq("status", "completed");

  if (!completedContacts?.length) return [];

  const evaluations: any[] = [];
  for (const contact of completedContacts) {
    const { data: callRow } = await sb
      .from("calls")
      .select("id")
      .eq("project_id", project_id)
      .eq("retell_call_id", contact.retell_call_id)
      .maybeSingle();

    if (!callRow?.id) continue;

    try {
      const evalResp = await fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callRow.id, test_run_contact_id: contact.id }),
      });
      if (evalResp.ok) evaluations.push(await evalResp.json());
    } catch (e) {
      console.error(`[auto-train] Eval failed for call ${callRow.id}:`, e);
    }
  }

  return evaluations;
}

// ═══════════════════════════════════════════════════════════════════
// APPLY RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════

async function applyRecommendations(
  supabaseUrl: string, serviceKey: string, evaluations: any[],
  project_id: string, auto_apply_severity: string[]
): Promise<any[]> {
  const allRecs: any[] = [];
  for (const evalData of evaluations) {
    for (const rec of evalData.evaluation?.recommended_improvements || []) {
      if (auto_apply_severity.includes(rec.severity)) allRecs.push(rec);
    }
  }

  const severityRank: Record<string, number> = { critical: 3, important: 2, minor: 1 };
  const deduped = new Map<string, any>();
  for (const rec of allRecs) {
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
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id, recommendation: rec.reason || `Change ${rec.field} to improve score`, category: "evaluation_loop" }),
      });
      if (applyResp.ok) {
        const result = await applyResp.json();
        if (result.success) appliedFixes.push({ field: rec.field, reason: rec.reason, severity: rec.severity, action: result.action });
      }
    } catch (e) {
      console.error(`[auto-train] Failed to apply fix for ${rec.field}:`, e);
    }
  }

  return appliedFixes;
}

