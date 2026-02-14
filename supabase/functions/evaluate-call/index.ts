import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { call_id, test_run_contact_id } = await req.json();
    if (!call_id) throw new Error("call_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: call, error: callErr } = await supabase
      .from("calls").select("*").eq("id", call_id).single();
    if (callErr) throw callErr;

    if (!call.transcript) {
      return new Response(JSON.stringify({ message: "No transcript to evaluate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", call.project_id).single();
    if (specErr) throw specErr;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ── Fetch improvement history + score trends for context ──
    let changeHistoryBlock = "";
    try {
      // Last 5 improvements for this agent
      const { data: recentImprovements } = await supabase
        .from("improvements")
        .select("from_version, to_version, change_summary, patch, created_at")
        .eq("project_id", call.project_id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Score snapshots for the last few versions
      const { data: snapshots } = await supabase
        .from("score_snapshots")
        .select("spec_version, voice_id, avg_humanness, avg_naturalness, avg_overall, call_count")
        .eq("project_id", call.project_id)
        .order("spec_version", { ascending: false })
        .limit(10);

      if ((recentImprovements?.length || 0) > 0 || (snapshots?.length || 0) > 0) {
        const lines: string[] = [];
        lines.push("\nRECENT CHANGE HISTORY (do NOT re-suggest changes that were already applied and didn't improve scores):");

        for (const imp of (recentImprovements || []).reverse()) {
          const patchFields = imp.patch ? Object.keys(imp.patch).filter(k => k !== "version").join(", ") : "unknown";
          const beforeSnap = (snapshots || []).find(s => s.spec_version === imp.from_version);
          const afterSnap = (snapshots || []).find(s => s.spec_version === imp.to_version);

          let scoreInfo = "";
          if (beforeSnap && afterSnap) {
            const diff = (afterSnap.avg_overall || 0) - (beforeSnap.avg_overall || 0);
            scoreInfo = diff > 0
              ? ` (scores before: ${beforeSnap.avg_overall}, after: ${afterSnap.avg_overall} -- IMPROVED)`
              : diff < 0
                ? ` (scores before: ${beforeSnap.avg_overall}, after: ${afterSnap.avg_overall} -- NO IMPROVEMENT, REGRESSION)`
                : ` (scores unchanged)`;
          } else if (afterSnap) {
            scoreInfo = ` (avg_overall after: ${afterSnap.avg_overall})`;
          }

          lines.push(`- v${imp.from_version}→v${imp.to_version}: ${imp.change_summary || `changed ${patchFields}`}${scoreInfo}`);
        }

        lines.push("If a previous fix didn't improve scores, suggest a DIFFERENT approach to the same problem.");
        changeHistoryBlock = lines.join("\n");
      }
    } catch (e) {
      console.error("Failed to fetch improvement history:", e);
    }

    const agentLang = (spec.language || "en").toLowerCase();
    const isNonEnglish = agentLang !== "en" && agentLang !== "english";
    const langInstruction = isNonEnglish
      ? `\n\nIMPORTANT: The agent operates in "${spec.language}". Write ALL evaluation text -- issues_detected, humanness_suggestions, knowledge_gaps, delivery_issues, missed_fields, incorrect_logic, and recommended_improvements (field, reason, suggested_value) -- in ${spec.language}. Only field names that map to spec keys (e.g. "opening_line") stay in English.`
      : "";

    const systemPrompt = `You are a Call Performance Auditor.
Evaluate the following call transcript against the Agent Specification provided.

HUMANNESS SCORING (0-100) -- THIS IS THE MOST IMPORTANT METRIC:
This scores conversational behavior (separate from naturalness which measures voice/delivery quality):
- Did the agent acknowledge what the caller said before asking the next question?
- Did it use the caller's name naturally (not robotically every sentence)?
- Were there moments of genuine warmth, humor, or empathy?
- Did it vary sentence structure or repeat the same patterns?
- Did transitions between topics feel natural or abrupt?
- Was there any small talk or rapport-building?
- Did the agent react to personal details the caller shared (kids, job, location)?
- Did it sound like a real person or a survey bot?
Score 90-100: Indistinguishable from a warm, skilled human caller
Score 70-89: Mostly human with occasional robotic moments
Score 40-69: Noticeably scripted, minimal rapport
Score 0-39: Full robot -- survey-style interrogation

For "humanness_suggestions", provide specific, actionable conversation techniques the agent should learn.

KNOWLEDGE GAP DETECTION:
Analyze the transcript for moments where the agent:
- Couldn't answer a question the caller asked about the product/service
- Gave vague or incorrect information about industry-specific topics
- Missed an opportunity to provide helpful domain knowledge
- Didn't know competitor details when asked
List each gap as a specific topic in "knowledge_gaps" (e.g., "couldn't explain net metering", "didn't know about federal tax credit eligibility").

NATURALNESS SCORING (0-100):
Analyze the transcript for signs of AI voice quality problems:
- Mispronounced or garbled words
- Repeated words or phrases
- Cut-off or incomplete sentences
- Robotic cadence
Score 90-100: Sounds completely natural
Score 70-89: Mostly natural with minor issues
Score 40-69: Noticeable AI artifacts
Score 0-39: Very robotic

List specific delivery problems in "delivery_issues".

Each recommended_improvement should be an object with:
- "field": the agent_spec field to change
- "current_value": what it is now
- "suggested_value": what it should be
- "reason": why this change would help

VOICE TUNING RECOMMENDATIONS:
- If repeated words detected → suggest lowering "temperature"
- If rushed pacing → suggest lowering "speaking_speed"
- If AI interrupts too quickly → suggest raising "interruption_threshold"
- If words mispronounced → suggest "pronunciation_guide" entries${changeHistoryBlock}${langInstruction}`;

    const userPrompt = `AGENT SPECIFICATION:\n${JSON.stringify(spec, null, 2)}\n\nCALL TRANSCRIPT:\n${call.transcript}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "evaluate_call",
            description: "Return the call evaluation results.",
            parameters: {
              type: "object",
              properties: {
                compliance_score: { type: "number" },
                objective_score: { type: "number" },
                overall_score: { type: "number" },
                naturalness_score: { type: "number" },
                humanness_score: { type: "number" },
                humanness_suggestions: { type: "array", items: { type: "string" } },
                knowledge_gaps: { type: "array", items: { type: "string" }, description: "Specific topics the agent lacked knowledge about during the call" },
                issues_detected: { type: "array", items: { type: "string" } },
                delivery_issues: { type: "array", items: { type: "string" } },
                missed_fields: { type: "array", items: { type: "string" } },
                incorrect_logic: { type: "array", items: { type: "string" } },
                hallucination_detected: { type: "boolean" },
                recommended_improvements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      current_value: { type: "string" },
                      suggested_value: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["field", "suggested_value", "reason"],
                  },
                },
              },
              required: ["compliance_score", "objective_score", "overall_score", "naturalness_score", "humanness_score", "humanness_suggestions", "knowledge_gaps", "issues_detected", "delivery_issues", "missed_fields", "incorrect_logic", "hallucination_detected", "recommended_improvements"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "evaluate_call" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      throw new Error("AI evaluation failed");
    }

    const aiData = await aiResp.json();
    let evaluation: any;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      evaluation = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
      else throw new Error("Could not parse evaluation from AI response");
    }

    // Store in calls.evaluation
    await supabase.from("calls").update({ evaluation }).eq("id", call_id);

    // Upsert into evaluations table
    await supabase.from("evaluations").upsert({
      call_id,
      overall_score: evaluation.overall_score,
      issues: evaluation.issues_detected,
      recommended_fixes: evaluation.recommended_improvements,
      rubric: {
        compliance_score: evaluation.compliance_score,
        objective_score: evaluation.objective_score,
        naturalness_score: evaluation.naturalness_score,
        humanness_score: evaluation.humanness_score,
        humanness_suggestions: evaluation.humanness_suggestions,
        knowledge_gaps: evaluation.knowledge_gaps,
        missed_fields: evaluation.missed_fields,
        incorrect_logic: evaluation.incorrect_logic,
        hallucination_detected: evaluation.hallucination_detected,
        delivery_issues: evaluation.delivery_issues,
      },
    }, { onConflict: "call_id" });

    // If test lab call, store evaluation
    if (test_run_contact_id) {
      await supabase.from("test_run_contacts").update({ evaluation }).eq("id", test_run_contact_id);
    }

    // ── Update score_snapshots ──
    try {
      const voiceId = spec.voice_id || null;
      const version = call.version || spec.version || 1;

      // Fetch existing snapshot for this version+voice
      const coalesceVoice = voiceId || "__null__";
      const { data: existing } = await supabase
        .from("score_snapshots")
        .select("*")
        .eq("project_id", call.project_id)
        .eq("spec_version", version)
        .limit(10);

      const match = (existing || []).find((s: any) =>
        (s.voice_id || "__null__") === coalesceVoice
      );

      if (match) {
        // Update running averages
        const n = match.call_count || 0;
        const newCount = n + 1;
        const avgH = ((match.avg_humanness || 0) * n + (evaluation.humanness_score || 0)) / newCount;
        const avgN = ((match.avg_naturalness || 0) * n + (evaluation.naturalness_score || 0)) / newCount;
        const avgO = ((match.avg_overall || 0) * n + (evaluation.overall_score || 0)) / newCount;

        await supabase.from("score_snapshots").update({
          avg_humanness: Math.round(avgH * 10) / 10,
          avg_naturalness: Math.round(avgN * 10) / 10,
          avg_overall: Math.round(avgO * 10) / 10,
          call_count: newCount,
        }).eq("id", match.id);
      } else {
        // Insert new snapshot
        await supabase.from("score_snapshots").insert({
          project_id: call.project_id,
          spec_version: version,
          voice_id: voiceId,
          avg_humanness: evaluation.humanness_score || 0,
          avg_naturalness: evaluation.naturalness_score || 0,
          avg_overall: evaluation.overall_score || 0,
          call_count: 1,
        });
      }
      console.log(`Score snapshot updated for project=${call.project_id} v${version} voice=${voiceId}`);
    } catch (e) {
      console.error("Failed to update score_snapshots:", e);
    }

    // ── Voice performance recommendation ──
    try {
      const currentVoice = spec.voice_id || null;
      if (currentVoice) {
        const { data: allSnapshots } = await supabase
          .from("score_snapshots")
          .select("voice_id, avg_humanness, avg_overall, call_count")
          .eq("project_id", call.project_id)
          .gte("call_count", 3);

        const currentSnaps = (allSnapshots || []).filter((s: any) => s.voice_id === currentVoice);
        const otherSnaps = (allSnapshots || []).filter((s: any) => s.voice_id && s.voice_id !== currentVoice && s.call_count >= 3);

        if (currentSnaps.length > 0 && otherSnaps.length > 0) {
          // Weighted average across versions for current voice
          const currentTotal = currentSnaps.reduce((a: number, s: any) => a + (s.call_count || 0), 0);
          const currentAvgH = currentSnaps.reduce((a: number, s: any) => a + (s.avg_humanness || 0) * (s.call_count || 0), 0) / (currentTotal || 1);

          // Find best alternative voice
          const voiceMap = new Map<string, { totalCalls: number; weightedH: number }>();
          for (const s of otherSnaps) {
            const v = voiceMap.get(s.voice_id) || { totalCalls: 0, weightedH: 0 };
            v.totalCalls += s.call_count || 0;
            v.weightedH += (s.avg_humanness || 0) * (s.call_count || 0);
            voiceMap.set(s.voice_id, v);
          }

          let bestVoice: string | null = null;
          let bestAvgH = currentAvgH;
          for (const [vid, v] of voiceMap) {
            const avg = v.weightedH / (v.totalCalls || 1);
            if (avg > bestAvgH + 5 && v.totalCalls >= 3) { // 5+ point improvement threshold
              bestAvgH = avg;
              bestVoice = vid;
            }
          }

          if (bestVoice) {
            const bestData = voiceMap.get(bestVoice)!;
            evaluation.voice_recommendation = {
              current_voice: currentVoice,
              current_avg_humanness: Math.round(currentAvgH),
              suggested_voice: bestVoice,
              suggested_avg_humanness: Math.round(bestAvgH),
              reason: `Voice '${bestVoice}' averaged ${Math.round(bestAvgH)} humanness over ${bestData.totalCalls} calls vs current voice '${currentVoice}' at ${Math.round(currentAvgH)}`,
            };
            // Re-save evaluation with voice_recommendation
            await supabase.from("calls").update({ evaluation }).eq("id", call_id);
            console.log(`Voice recommendation: switch from ${currentVoice} to ${bestVoice}`);
          }
        }
      }
    } catch (e) {
      console.error("Failed to compute voice recommendation:", e);
    }

    // Auto-apply humanness learnings
    if (evaluation.humanness_suggestions?.length > 0) {
      try {
        const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
        const newSuggestions = evaluation.humanness_suggestions.filter(
          (s: string) => !currentNotes.some((existing: string) => existing.toLowerCase() === s.toLowerCase())
        );
        if (newSuggestions.length > 0) {
          const merged = [...currentNotes, ...newSuggestions].slice(-20);
          await supabase.from("agent_specs").update({ humanization_notes: merged }).eq("id", spec.id);
          console.log(`Auto-applied ${newSuggestions.length} humanness suggestions`);
        }

        // Also save to global_human_behaviors for cross-agent learning
        const { data: existingGlobal } = await supabase
          .from("global_human_behaviors").select("content");
        const existingGlobalSet = new Set((existingGlobal || []).map((g: any) => g.content.toLowerCase().trim()));
        const globalNew = evaluation.humanness_suggestions.filter(
          (s: string) => !existingGlobalSet.has(s.toLowerCase().trim())
        );
        if (globalNew.length > 0) {
          await supabase.from("global_human_behaviors").insert(
            globalNew.map((s: string) => ({
              content: s,
              source_type: "auto_learned",
              source_agent_id: call.project_id,
            }))
          );
          console.log(`Saved ${globalNew.length} behaviors to global library`);
        }
      } catch (e) {
        console.error("Failed to auto-apply humanness notes:", e);
      }
    }

    // Trigger auto-research when gaps are significant
    const shouldResearch =
      (evaluation.humanness_score != null && evaluation.humanness_score < 80) ||
      (evaluation.issues_detected?.length >= 2) ||
      (evaluation.humanness_suggestions?.length >= 2) ||
      (evaluation.knowledge_gaps?.length >= 1);

    if (shouldResearch) {
      try {
        console.log("Triggering research-and-improve for project:", call.project_id);
        const researchResp = await fetch(`${supabaseUrl}/functions/v1/research-and-improve`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project_id: call.project_id, evaluation, spec }),
        });
        if (researchResp.ok) {
          const researchData = await researchResp.json();
          console.log(`Research complete: ${researchData.entries_saved || 0} entries saved`);
        } else {
          console.error("Research failed:", researchResp.status, await researchResp.text());
        }
      } catch (e) {
        console.error("Failed to trigger research:", e);
      }
    }

    // Success-based learning: trigger learn-from-success every 5th qualified call
    if (call.outcome === "qualified") {
      try {
        const { count } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("project_id", call.project_id)
          .eq("outcome", "qualified");

        if (count && count >= 5 && count % 5 === 0) {
          console.log(`${count}th qualified call for project ${call.project_id}, triggering learn-from-success`);
          fetch(`${supabaseUrl}/functions/v1/learn-from-success`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ project_id: call.project_id }),
          }).then(async (r) => {
            if (r.ok) {
              const d = await r.json();
              console.log(`learn-from-success: ${d.patterns_saved || 0} patterns saved`);
            } else {
              console.error("learn-from-success failed:", r.status);
            }
          }).catch((e) => console.error("learn-from-success error:", e));
        }
      } catch (e) {
        console.error("Failed to check/trigger success learning:", e);
      }
    }

    return new Response(JSON.stringify({ evaluation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("evaluate-call error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
