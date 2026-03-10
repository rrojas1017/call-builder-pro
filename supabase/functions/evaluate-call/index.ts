import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let { call_id, test_run_contact_id } = await req.json();

    // Allow triggering re-evaluation by test_run_contact_id alone (e.g. after user feedback)
    if (!call_id && test_run_contact_id) {
      const { data: trc, error: trcErr } = await supabase
        .from("test_run_contacts")
        .select("retell_call_id")
        .eq("id", test_run_contact_id)
        .single();
      if (trcErr || !trc?.retell_call_id) throw new Error("Could not find call for this test contact");
      const { data: callRow, error: callLookupErr } = await supabase
        .from("calls")
        .select("id")
        .eq("retell_call_id", trc.retell_call_id)
        .single();
      if (callLookupErr || !callRow) throw new Error("No call found matching retell_call_id");
      call_id = callRow.id;
    }

    if (!call_id) throw new Error("call_id or test_run_contact_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Using Lovable AI gateway (Gemini) for evaluation — no external API key needed
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
    const langInstruction = `\n\nLANGUAGE DIRECTIVE: The agent operates in "${spec.language || "English"}". Write ALL evaluation feedback — issues_detected, humanness_suggestions, knowledge_gaps, delivery_issues, missed_fields, incorrect_logic, and recommended_improvements (reason, suggested_value) — in the SAME language as the conversation transcript (${spec.language || "English"}). Only spec field keys (e.g. "opening_line", "tone_style") stay in English. This applies regardless of whether the conversation is in English or another language — always match the transcript's language.`;

    const systemPrompt = `You are a Call Performance Auditor. You are an expert at evaluating AI phone agent conversations.

CRITICAL INSTRUCTION — CHAIN-OF-THOUGHT SCORING:
Before assigning each numeric score, write a brief internal rationale (2-3 sentences) explaining your reasoning. Consider specific transcript moments that support your score. Then assign the numeric score. This ensures calibrated, consistent scoring.

ANTI-REPETITION DIRECTIVE:
Check your suggested improvements against the RECENT CHANGE HISTORY below. If a similar suggestion was already applied without score improvement, you MUST suggest a fundamentally different approach — not a variation of the same fix. For example, if lowering temperature didn't help, don't suggest lowering it further; suggest changing tone_style or opening_line instead.

DOMAIN CONSTRAINT: This agent's use case is "${spec.use_case || 'general'}".
ALL suggested improvements MUST be directly relevant to this domain.
Do NOT suggest examples, rapport-building lines, or business rules from
unrelated industries (e.g., travel examples for a health insurance agent).
Every suggested_value must make sense in the context of "${spec.use_case}".

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
- "suggested_value": what it should be — FORMAT RULES BELOW
- "reason": why this change would help
- "severity": one of "critical" (blocking agent success), "important" (noticeably hurts performance), or "minor" (polish)

CRITICAL FORMAT RULES FOR suggested_value:
- For "must_collect_fields": suggested_value MUST be a JSON array of question strings, e.g. ["What is your zip code?", "Do you currently have Medicaid?"]
- For "humanization_notes": suggested_value MUST be a JSON array of technique strings, e.g. ["React to personal details the caller shares", "Use their name after they share something personal"]
- For "research_sources": suggested_value MUST be a JSON array of source strings
- For other JSON fields (qualification_rules, disqualification_rules, etc.): suggested_value must be valid JSON matching the field's expected schema
- For text fields (tone_style, opening_line, etc.): suggested_value should be a plain string
- NEVER return prose paragraphs for array fields. Always return a JSON array.

SEVERITY GUIDELINES:
- "critical": Issues that directly cause call failures, hang-ups, or compliance violations
- "important": Issues that noticeably reduce conversion rates or caller satisfaction
- "minor": Polish items that would incrementally improve quality

VOICE TUNING RECOMMENDATIONS:
- If repeated words detected → suggest lowering "temperature"
- If rushed pacing → suggest lowering "speaking_speed"
- If AI interrupts too quickly → suggest raising "interruption_threshold"
- If words mispronounced → suggest "pronunciation_guide" entries${changeHistoryBlock}${langInstruction}`;

    // Fetch user feedback if this is a test call
    let userFeedbackBlock = "";
    if (test_run_contact_id) {
      try {
        const { data: trc } = await supabase
          .from("test_run_contacts")
          .select("user_feedback")
          .eq("id", test_run_contact_id)
          .single();
        if (trc?.user_feedback) {
          userFeedbackBlock = `\n\nUSER'S OWN FEEDBACK AFTER THIS CALL:\n${trc.user_feedback}\n\nIMPORTANT: The user provided the above feedback after listening to/participating in this call. Treat it as high-priority input — factor it into your scoring rationale and recommended improvements. If the user identifies specific issues or suggestions, reflect those in your evaluation.`;
        }
      } catch (e) {
        console.error("Failed to fetch user feedback:", e);
      }
    }

    const userPrompt = `AGENT SPECIFICATION:\n${JSON.stringify(spec, null, 2)}\n\nCALL TRANSCRIPT:\n${call.transcript}${userFeedbackBlock}`;

    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-2.5-flash",
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
                    suggested_value: { type: "string", description: "For array fields (must_collect_fields, humanization_notes, research_sources), this MUST be a valid JSON array string e.g. [\"item1\", \"item2\"]. For text fields, a plain string. NEVER prose paragraphs for array fields." },
                    reason: { type: "string" },
                    severity: { type: "string", enum: ["critical", "important", "minor"], description: "How impactful this fix is" },
                  },
                  required: ["field", "suggested_value", "reason", "severity"],
                },
              },
            },
            required: ["compliance_score", "objective_score", "overall_score", "naturalness_score", "humanness_score", "humanness_suggestions", "knowledge_gaps", "issues_detected", "delivery_issues", "missed_fields", "incorrect_logic", "hallucination_detected", "recommended_improvements"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "evaluate_call" } },
      max_tokens: 12000,
    });

    let evaluation: any = aiResponse.tool_calls[0]?.arguments;

    // Fallback: if AI returned text instead of tool call, try to extract JSON
    if (!evaluation && aiResponse.content) {
      console.warn("AI did not use tool call, attempting to extract JSON from text response");
      try {
        let text = aiResponse.content;
        // Strip markdown code fences
        text = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
        // Find JSON object boundaries
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start) {
          evaluation = JSON.parse(text.substring(start, end + 1));
        }
      } catch (parseErr) {
        console.error("Failed to parse AI text as JSON:", parseErr);
      }
    }

    if (!evaluation) {
      throw new Error("AI did not return structured evaluation");
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

    // ── Verbal Training Feedback Extraction (test calls only) ──
    if (test_run_contact_id && call.transcript) {
      try {
        console.log("Extracting verbal training feedback from test call transcript");
        const verbalPrompt = `You are a Training Feedback Extractor. Analyze this phone call transcript between a human tester and an AI agent.

The human tester may have given explicit verbal coaching/training instructions to the AI agent during the call. Look for phrases like:
- "You should..." / "You need to..."
- "Don't say..." / "Don't ask..."
- "Try saying..." / "Instead of...say..."
- "Next time..." / "In the future..."
- "Be more/less..." (e.g., "be more casual", "be less pushy")
- "Slow down" / "Speed up" / "Talk faster/slower"
- "When someone asks about X, say Y"
- "Remember to..." / "Make sure you..."
- "That was wrong" / "That's not right" / "Actually..."
- Direct corrections of facts or product knowledge

Map each instruction to the most appropriate agent_spec field:
- Tone/personality/style feedback → "tone_style"
- Greeting or intro changes → "opening_line"  
- "Say X instead of Y" for general conversation → "business_rules"
- "Don't ask about X" / "Ask about Y first" → "must_collect_fields"
- "Be more/less..." personality traits → "humanization_notes"
- Speed/pacing feedback → "speaking_speed"
- Product knowledge corrections → "agent_knowledge"
- Pronunciation corrections → "pronunciation_guide"

Only extract EXPLICIT training instructions from the human caller. Do NOT extract the AI agent's own statements or general conversation. If there are no training instructions, return an empty array.

TRANSCRIPT:
${call.transcript}`;

        const verbalResponse = await callAI({
          provider: "gemini",
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "user", content: verbalPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_training_feedback",
              description: "Return verbal training feedback found in the transcript.",
              parameters: {
                type: "object",
                properties: {
                  training_feedback: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        instruction: { type: "string", description: "The exact or paraphrased training instruction from the caller" },
                        target_field: { type: "string", description: "The agent_spec field this maps to" },
                        suggested_change: { type: "string", description: "The specific change to make to the agent spec" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["instruction", "target_field", "suggested_change", "confidence"],
                    },
                  },
                },
                required: ["training_feedback"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_training_feedback" } },
          max_tokens: 4000,
        });

        const verbalResult = verbalResponse.tool_calls?.[0]?.arguments;
        const feedbackItems = verbalResult?.training_feedback || [];

        if (feedbackItems.length > 0) {
          console.log(`Found ${feedbackItems.length} verbal training feedback items`);

          // Auto-apply high-confidence feedback
          const highConfidence = feedbackItems.filter((f: any) => f.confidence === "high");
          const applied: any[] = [];

          for (const fb of highConfidence) {
            try {
              // For agent_knowledge, insert directly
              if (fb.target_field === "agent_knowledge") {
                await supabase.from("agent_knowledge").insert({
                  project_id: call.project_id,
                  content: fb.suggested_change,
                  category: "verbal_training",
                  source_type: "verbal_training",
                });
                applied.push({ ...fb, auto_applied: true });
                console.log(`Verbal training: added knowledge entry`);
                continue;
              }

              // For pronunciation_guide, route through apply-improvement for version tracking
              if (fb.target_field === "pronunciation_guide") {
                const currentGuide: any[] = Array.isArray(spec.pronunciation_guide) ? spec.pronunciation_guide : [];
                let newEntry: any;
                try {
                  newEntry = JSON.parse(fb.suggested_change);
                } catch {
                  newEntry = { word: fb.suggested_change, pronunciation: fb.suggested_change };
                }
                const merged = [...currentGuide, newEntry];
                const pronResp = await fetch(`${supabaseUrl}/functions/v1/apply-improvement`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    project_id: call.project_id,
                    improvement: {
                      field: "pronunciation_guide",
                      suggested_value: merged,
                      reason: `[VERBAL-TRAINING] ${fb.instruction || "Updated pronunciation guide"}`,
                      original_key: `verbal::pronunciation_guide::${fb.suggested_change}`.slice(0, 200),
                      replace_mode: true,
                    },
                  }),
                });
                if (pronResp.ok) {
                  applied.push({ ...fb, auto_applied: true });
                  console.log(`Verbal training: updated pronunciation_guide via apply-improvement`);
                } else {
                  applied.push({ ...fb, auto_applied: false });
                  console.error(`Verbal training: failed pronunciation_guide:`, await pronResp.text());
                }
                continue;
              }

              // For other fields, use apply-improvement
              // Detect reorder intent from the instruction
              const isReorder = fb.instruction?.toLowerCase().includes("first") ||
                fb.instruction?.toLowerCase().includes("before") ||
                fb.instruction?.toLowerCase().includes("order") ||
                fb.instruction?.toLowerCase().includes("reorder");

              const applyResp = await fetch(`${supabaseUrl}/functions/v1/apply-improvement`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  project_id: call.project_id,
                  improvement: {
                    field: fb.target_field,
                    suggested_value: fb.suggested_change,
                    reason: `[VERBAL-TRAINING] ${fb.instruction}`,
                    original_key: `verbal::${fb.target_field}::${fb.suggested_change}`.slice(0, 200),
                    ...(isReorder ? { replace_mode: true } : {}),
                  },
                }),
              });
              if (applyResp.ok) {
                applied.push({ ...fb, auto_applied: true });
                console.log(`Verbal training: applied ${fb.target_field}`);
              } else {
                applied.push({ ...fb, auto_applied: false });
                console.error(`Verbal training: failed to apply ${fb.target_field}:`, await applyResp.text());
              }
            } catch (e) {
              applied.push({ ...fb, auto_applied: false });
              console.error(`Verbal training error for ${fb.target_field}:`, e);
            }
          }

          // Medium/low confidence items are stored but not auto-applied
          const notApplied = feedbackItems
            .filter((f: any) => f.confidence !== "high")
            .map((f: any) => ({ ...f, auto_applied: false }));

          // Merge into evaluation and update
          evaluation.verbal_training_feedback = [...applied, ...notApplied];
          await supabase.from("calls").update({ evaluation }).eq("id", call_id);
          if (test_run_contact_id) {
            await supabase.from("test_run_contacts").update({ evaluation }).eq("id", test_run_contact_id);
          }

          console.log(`Verbal training: ${applied.filter(a => a.auto_applied).length} auto-applied, ${notApplied.length} stored for review`);
        } else {
          console.log("No verbal training feedback found in transcript");
        }
      } catch (e) {
        console.error("Failed to extract verbal training feedback:", e);
      }
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

    // ── Voice performance recommendation (Tier 1: same-agent, Tier 2: cross-agent) ──
    try {
      const currentVoice = spec.voice_id || null;
      if (currentVoice) {
        // --- Tier 1: Same-agent voice comparison ---
        const { data: agentSnapshots } = await supabase
          .from("score_snapshots")
          .select("voice_id, avg_humanness, avg_overall, call_count")
          .eq("project_id", call.project_id)
          .gte("call_count", 3);

        const currentSnaps = (agentSnapshots || []).filter((s: any) => s.voice_id === currentVoice);
        const otherSnaps = (agentSnapshots || []).filter((s: any) => s.voice_id && s.voice_id !== currentVoice && s.call_count >= 3);

        // Weighted average for current voice
        const currentTotal = currentSnaps.reduce((a: number, s: any) => a + (s.call_count || 0), 0);
        const currentAvgH = currentTotal > 0
          ? currentSnaps.reduce((a: number, s: any) => a + (s.avg_humanness || 0) * (s.call_count || 0), 0) / currentTotal
          : evaluation.humanness_score || 0;

        let recommended = false;

        if (currentSnaps.length > 0 && otherSnaps.length > 0) {
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
            if (avg > bestAvgH + 5 && v.totalCalls >= 3) {
              bestAvgH = avg;
              bestVoice = vid;
            }
          }

          if (bestVoice) {
            const bestData = voiceMap.get(bestVoice)!;
            const confidence = bestData.totalCalls >= 10 ? "high" : bestData.totalCalls >= 5 ? "medium" : "low";
            evaluation.voice_recommendation = {
              current_voice: currentVoice,
              current_avg_humanness: Math.round(currentAvgH),
              suggested_voice: bestVoice,
              suggested_avg_humanness: Math.round(bestAvgH),
              source: "same_agent",
              confidence,
              sample_size: bestData.totalCalls,
              reason: `Voice '${bestVoice}' averaged ${Math.round(bestAvgH)} humanness over ${bestData.totalCalls} calls vs your current voice '${currentVoice}' at ${Math.round(currentAvgH)}. Consider A/B testing.`,
            };
            recommended = true;
            console.log(`Tier 1 voice recommendation: ${currentVoice} → ${bestVoice}`);
          }
        }

        // --- Tier 2: Cross-agent fallback ---
        if (!recommended) {
          const agentLang = (spec.language || "en").toLowerCase();

          // Get all snapshots platform-wide with higher confidence bar
          const { data: globalSnapshots } = await supabase
            .from("score_snapshots")
            .select("voice_id, avg_humanness, call_count, project_id")
            .neq("voice_id", currentVoice)
            .gte("call_count", 5)
            .not("voice_id", "is", null);

          if (globalSnapshots && globalSnapshots.length > 0) {
            // Get all agent_specs to filter by matching language
            const projectIds = [...new Set(globalSnapshots.map((s: any) => s.project_id))];
            const { data: specs } = await supabase
              .from("agent_specs")
              .select("project_id, language")
              .in("project_id", projectIds);

            const langMatchProjects = new Set(
              (specs || [])
                .filter((s: any) => (s.language || "en").toLowerCase() === agentLang)
                .map((s: any) => s.project_id)
            );

            // Aggregate by voice_id across language-matched projects
            const crossVoiceMap = new Map<string, { totalCalls: number; weightedH: number; agentCount: number; agents: Set<string> }>();
            for (const s of globalSnapshots) {
              if (!langMatchProjects.has(s.project_id)) continue;
              const existing = crossVoiceMap.get(s.voice_id) || { totalCalls: 0, weightedH: 0, agentCount: 0, agents: new Set<string>() };
              existing.totalCalls += s.call_count || 0;
              existing.weightedH += (s.avg_humanness || 0) * (s.call_count || 0);
              existing.agents.add(s.project_id);
              crossVoiceMap.set(s.voice_id, existing);
            }

            let bestCrossVoice: string | null = null;
            let bestCrossAvgH = currentAvgH;
            for (const [vid, v] of crossVoiceMap) {
              const avg = v.weightedH / (v.totalCalls || 1);
              // Higher threshold (8 points) for cross-agent recommendations
              if (avg > bestCrossAvgH + 8 && v.totalCalls >= 5) {
                bestCrossAvgH = avg;
                bestCrossVoice = vid;
              }
            }

            if (bestCrossVoice) {
              const bestData = crossVoiceMap.get(bestCrossVoice)!;
              const agentCount = bestData.agents.size;
              evaluation.voice_recommendation = {
                current_voice: currentVoice,
                current_avg_humanness: Math.round(currentAvgH),
                suggested_voice: bestCrossVoice,
                suggested_avg_humanness: Math.round(bestCrossAvgH),
                source: "cross_agent",
                confidence: bestData.totalCalls >= 10 ? "medium" : "low",
                sample_size: bestData.totalCalls,
                reason: `Voice '${bestCrossVoice}' averaged ${Math.round(bestCrossAvgH)} humanness across ${bestData.totalCalls} calls on ${agentCount} agent${agentCount > 1 ? "s" : ""} vs your current voice '${currentVoice}' at ${Math.round(currentAvgH)}. Based on platform-wide data. Consider A/B testing.`,
              };
              console.log(`Tier 2 cross-agent voice recommendation: ${currentVoice} → ${bestCrossVoice}`);
            }
          }
        }

        // Save evaluation with voice_recommendation if one was added
        if (evaluation.voice_recommendation) {
          await supabase.from("calls").update({ evaluation }).eq("id", call_id);
        }
      }
    } catch (e) {
      console.error("Failed to compute voice recommendation:", e);
    }

    // Auto-apply humanness learnings via apply-improvement (proper versioning)
    if (evaluation.humanness_suggestions?.length > 0) {
      try {
        const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
        const newSuggestions = evaluation.humanness_suggestions.filter(
          (s: string) => !currentNotes.some((existing: string) => existing.toLowerCase() === s.toLowerCase())
        );
        if (newSuggestions.length > 0) {
          const merged = [...currentNotes, ...newSuggestions].slice(-20);
          // Route through apply-improvement for proper version tracking
          const applyResp = await fetch(`${supabaseUrl}/functions/v1/apply-improvement`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              project_id: call.project_id,
              improvement: {
                field: "humanization_notes",
                suggested_value: merged,
                reason: `[AUTO-HUMANNESS] Applied ${newSuggestions.length} humanness suggestions`,
                original_key: `humanness::batch::${Date.now()}`,
                replace_mode: true,
              },
            }),
          });
          if (applyResp.ok) {
            console.log(`Auto-applied ${newSuggestions.length} humanness suggestions via apply-improvement`);
          } else {
            console.error("Failed to apply humanness via apply-improvement:", await applyResp.text());
          }
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

    // ── Persist knowledge gaps to agent_knowledge ──
    if (evaluation.knowledge_gaps?.length > 0) {
      try {
        // Fetch existing knowledge_gap entries for deduplication
        const { data: existingGaps } = await supabase
          .from("agent_knowledge")
          .select("content")
          .eq("project_id", call.project_id)
          .eq("category", "knowledge_gap");

        const existingSet = new Set(
          (existingGaps || []).map((g: any) => g.content.toLowerCase().trim())
        );

        const newGaps = evaluation.knowledge_gaps.filter(
          (gap: string) => !existingSet.has(gap.toLowerCase().trim())
        );

        if (newGaps.length > 0) {
          await supabase.from("agent_knowledge").insert(
            newGaps.map((gap: string) => ({
              project_id: call.project_id,
              content: gap,
              category: "knowledge_gap",
              source_type: "auto_evaluation",
            }))
          );
          console.log(`Persisted ${newGaps.length} knowledge gaps to agent_knowledge`);
        }
      } catch (e) {
        console.error("Failed to persist knowledge gaps:", e);
      }
    }

    // ── SAFE LEARNING GATE: Only auto-modify from simulated/test calls ──
    // Live calls are scored and reviewed but NEVER auto-modify the agent.
    // This prevents callers from manipulating the agent's behavior.
    const isSimulatedOrTest = call.voice_provider === "simulated" || !!test_run_contact_id;

    // ── Auto-apply critical-severity improvements ──
    // Protected fields: skip auto-critical overwrites for fields that were
    // recently set manually (verbal training or direct DB update)
    const PROTECTED_FIELDS = ["opening_line"];

    if (isSimulatedOrTest && evaluation.recommended_improvements?.length > 0) {
      try {
        const criticalFixes = evaluation.recommended_improvements.filter(
          (imp: any) => imp.severity === "critical"
        );

        // Check recent improvements for protected fields to detect manual edits
        let recentManualFields = new Set<string>();
        try {
          const { data: recentImps } = await supabase
            .from("improvements")
            .select("patch, change_summary")
            .eq("project_id", call.project_id)
            .order("created_at", { ascending: false })
            .limit(10);

          for (const imp of (recentImps || [])) {
            const summary = imp.change_summary || "";
            if (summary.includes("[VERBAL-TRAINING]") || summary.includes("[MANUAL]")) {
              const patchKeys = imp.patch ? Object.keys(imp.patch).filter(k => k !== "version") : [];
              patchKeys.forEach(k => recentManualFields.add(k));
            }
          }
        } catch (e) {
          console.error("Failed to check recent manual edits:", e);
        }

        for (const fix of criticalFixes) {
          // Skip auto-critical overwrites for protected fields that were manually set
          if (PROTECTED_FIELDS.includes(fix.field) && recentManualFields.has(fix.field)) {
            console.log(`Skipping auto-critical for "${fix.field}" — recently set manually`);
            continue;
          }

          try {
            console.log(`Auto-applying critical fix: ${fix.field} — ${fix.reason}`);

            // Detect if this is a reorder request for array fields
            const isReorder = fix.reason?.toLowerCase().includes("reorder") ||
              fix.reason?.toLowerCase().includes("order") ||
              fix.reason?.toLowerCase().includes("first");

            const applyResp = await fetch(`${supabaseUrl}/functions/v1/apply-improvement`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                project_id: call.project_id,
                improvement: {
                  field: fix.field,
                  suggested_value: fix.suggested_value,
                  reason: `[AUTO-CRITICAL] ${fix.reason}`,
                  original_key: `${fix.field}::${fix.suggested_value}`.slice(0, 200),
                  ...(isReorder ? { replace_mode: true } : {}),
                },
              }),
            });
            if (applyResp.ok) {
              const result = await applyResp.json();
              console.log(`Critical fix applied: ${fix.field} v${result.from_version}→v${result.to_version}`);
            } else {
              console.error(`Critical fix failed for ${fix.field}:`, applyResp.status, await applyResp.text());
            }
          } catch (e) {
            console.error(`Failed to auto-apply critical fix ${fix.field}:`, e);
          }
        }

      if (criticalFixes.length > 0) {
          console.log(`Auto-applied ${criticalFixes.length} critical improvements`);
        }
      } catch (e) {
        console.error("Failed to auto-apply critical improvements:", e);
      }
    } else if (!isSimulatedOrTest && evaluation.recommended_improvements?.length > 0) {
      console.log(`[evaluate-call] Live call ${call_id} — ${evaluation.recommended_improvements.length} improvements found but auto-apply SKIPPED (live call protection)`);
    }

    // Trigger auto-research when gaps are significant (ONLY for simulated/test calls)
    // Research cooldown: only trigger if not researched recently for this version
    const shouldResearch =
      (evaluation.humanness_score != null && evaluation.humanness_score < 80) ||
      (evaluation.issues_detected?.length >= 3) ||
      (evaluation.knowledge_gaps?.length >= 2);

    if (shouldResearch) {
      // Check cooldown: skip if researched in last 5 calls for this project
      let skipResearch = false;
      try {
        const { data: recentKnowledge } = await supabase
          .from("agent_knowledge")
          .select("created_at")
          .eq("project_id", call.project_id)
          .eq("source_type", "auto_research")
          .order("created_at", { ascending: false })
          .limit(1);
        if (recentKnowledge?.length > 0) {
          const lastResearch = new Date(recentKnowledge[0].created_at);
          const hoursSince = (Date.now() - lastResearch.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 2) {
            skipResearch = true;
            console.log(`Skipping research — last research was ${Math.round(hoursSince * 60)}min ago (cooldown: 2h)`);
          }
        }
      } catch (e) {
        console.error("Research cooldown check failed:", e);
      }

      if (!skipResearch) {
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
      } // end !skipResearch
    }

    // ── Auto-Graduation Check ──
    try {
      // Count total evaluated calls for this agent
      const { count: totalEvaluated } = await supabase
        .from("evaluations")
        .select("id", { count: "exact", head: true })
        .in("call_id", 
          (await supabase.from("calls").select("id").eq("project_id", call.project_id)).data?.map((c: any) => c.id) || []
        );

      const evalCount = totalEvaluated || 0;

      // Get recent scores ordered by creation
      const { data: recentEvals } = await supabase
        .from("evaluations")
        .select("overall_score, call_id")
        .in("call_id",
          (await supabase.from("calls").select("id").eq("project_id", call.project_id).order("created_at", { ascending: false }).limit(30)).data?.map((c: any) => c.id) || []
        );

      const scores = (recentEvals || []).map((e: any) => e.overall_score).filter((s: any) => s != null) as number[];

      // Determine maturity level
      let newLevel = "training";
      if (evalCount >= 30 && scores.length >= 15) {
        const last15Avg = scores.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
        // Check stability: no version with score drop > 5 pts
        const snapVersions = (await supabase.from("score_snapshots").select("avg_overall, spec_version").eq("project_id", call.project_id).order("spec_version", { ascending: true })).data || [];
        let stable = true;
        for (let i = 1; i < snapVersions.length; i++) {
          if ((snapVersions[i-1].avg_overall || 0) - (snapVersions[i].avg_overall || 0) > 5) { stable = false; break; }
        }
        if (last15Avg >= 90 && stable) newLevel = "graduated";
        else if (scores.length >= 10) {
          const last10Avg = scores.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
          const last5Min = Math.min(...scores.slice(0, 5));
          if (last10Avg >= 85 && last5Min >= 70 && evalCount >= 20) newLevel = "expert";
          else if (last10Avg >= 70 && evalCount >= 10) newLevel = "competent";
          else if (evalCount >= 5) newLevel = scores.slice(0, Math.min(scores.length, 10)).reduce((a, b) => a + b, 0) / Math.min(scores.length, 10) >= 50 ? "developing" : "training";
        }
      } else if (evalCount >= 20 && scores.length >= 10) {
        const last10Avg = scores.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const last5Min = Math.min(...scores.slice(0, 5));
        if (last10Avg >= 85 && last5Min >= 70) newLevel = "expert";
        else if (last10Avg >= 70) newLevel = "competent";
        else newLevel = "developing";
      } else if (evalCount >= 10 && scores.length >= 10) {
        const last10Avg = scores.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        if (last10Avg >= 70) newLevel = "competent";
        else if (last10Avg >= 50) newLevel = "developing";
      } else if (evalCount >= 5) {
        const avg = scores.slice(0, Math.min(scores.length, 10)).reduce((a, b) => a + b, 0) / Math.min(scores.length, 10);
        if (avg >= 50) newLevel = "developing";
      }

      await supabase.from("agent_projects").update({ maturity_level: newLevel } as any).eq("id", call.project_id);
      console.log(`Maturity level updated: ${newLevel} (${evalCount} evals, recent scores: ${scores.slice(0, 5).join(",")})`);
    } catch (e) {
      console.error("Failed graduation check:", e);
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
