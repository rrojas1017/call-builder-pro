import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Utterance {
  role: "agent" | "user";
  content: string;
}

interface RetellRequest {
  response_id?: number;
  interaction_type: "update_only" | "response_required" | "reminder_required" | "ping_pong";
  transcript: Utterance[];
  call?: Record<string, unknown>;
}

interface RetellResponse {
  response_id?: number;
  content: string;
  content_complete: boolean;
  end_call?: boolean;
}

/** Format transcript array into "Agent: ...\nUser: ..." for DB storage */
function formatTranscript(transcript: Utterance[]): string {
  return transcript
    .map((u) => `${u.role === "agent" ? "Agent" : "User"}: ${u.content}`)
    .join("\n");
}

/** Build OpenAI-compatible messages from Retell transcript */
function buildMessages(
  systemPrompt: string,
  transcript: Utterance[]
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const u of transcript) {
    messages.push({
      role: u.role === "agent" ? "assistant" : "user",
      content: u.content,
    });
  }
  return messages;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Upgrade to WebSocket
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // State for this call
  let contactId: string | null = null;
  let systemPrompt = "You are a helpful phone agent. Be natural and conversational.";
  let lastTranscriptLength = 0;

  socket.onopen = () => {
    console.log("WebSocket connected");

    // Send config event to enable auto_reconnect and request call details
    const configEvent = {
      response_type: "config",
      config: {
        auto_reconnect: true,
        call_details: true,
      },
    };
    socket.send(JSON.stringify(configEvent));
  };

  socket.onmessage = async (event) => {
    try {
      const data: RetellRequest = JSON.parse(event.data as string);

      // Handle ping_pong
      if (data.interaction_type === "ping_pong") {
        socket.send(JSON.stringify({ response_type: "ping_pong", timestamp: Date.now() }));
        return;
      }

      // Extract metadata from call details (sent with first message)
      if (data.call && !contactId) {
        const metadata = (data.call as any).metadata || {};
        contactId = metadata.test_run_contact_id || null;

        // Load agent prompt from the spec
        const projectId = metadata.project_id;
        if (projectId) {
          try {
            // Fetch the test run's agent_instructions_text or fall back to generating prompt
            const testRunId = metadata.test_run_id;
            if (testRunId) {
              const { data: testRun } = await supabase
                .from("test_runs")
                .select("agent_instructions_text")
                .eq("id", testRunId)
                .single();
              if (testRun?.agent_instructions_text) {
                systemPrompt = testRun.agent_instructions_text;
              }
            }

            // If no custom instructions, build the full prompt from spec + knowledge
            if (systemPrompt === "You are a helpful phone agent. Be natural and conversational.") {
              const { data: spec } = await supabase
                .from("agent_specs")
                .select("*")
                .eq("project_id", projectId)
                .single();
              if (spec) {
                // Load knowledge entries for this project
                const { data: knowledgeRows } = await supabase
                  .from("agent_knowledge")
                  .select("category, content")
                  .eq("project_id", projectId)
                  .limit(50);
                const knowledge = (knowledgeRows || []).map((r: any) => ({
                  category: r.category,
                  content: r.content,
                }));

                // Build the full prompt — same as outbound calls
                systemPrompt = buildTaskPrompt(spec as any, knowledge, undefined, undefined);
              }
            }
          } catch (e) {
            console.error("Failed to load agent prompt:", e);
          }
        }

        // Enforce language in system prompt based on metadata
        const language = metadata.language || "en-US";
        if (language.startsWith("es") || language === "multi") {
          systemPrompt += "\n\nCRITICAL: You MUST respond ENTIRELY in Spanish. Every word you say must be in Spanish. Never switch to English under any circumstances.";
        } else if (!language.startsWith("en")) {
          systemPrompt += `\n\nCRITICAL: Respond in the language matching locale code "${language}". Never switch to English.`;
        }

        console.log(`Call metadata loaded. contactId=${contactId}, language=${language}`);
      }

      // Write live transcript to DB on every update
      if (data.transcript && data.transcript.length > 0 && contactId) {
        // Only write if transcript has grown
        if (data.transcript.length > lastTranscriptLength) {
          lastTranscriptLength = data.transcript.length;
          const formattedTranscript = formatTranscript(data.transcript);
          await supabase
            .from("test_run_contacts")
            .update({ transcript: formattedTranscript })
            .eq("id", contactId);
        }
      }

      // Handle update_only - no response needed
      if (data.interaction_type === "update_only") {
        return;
      }

      // Handle response_required and reminder_required
      if (
        data.interaction_type === "response_required" ||
        data.interaction_type === "reminder_required"
      ) {
        const responseId = data.response_id;

        // For reminder, use a simpler prompt
        let promptForThisTurn = systemPrompt;
        if (data.interaction_type === "reminder_required") {
          promptForThisTurn +=
            "\n\nThe user has been silent for a while. Send a brief, natural follow-up to re-engage them. Keep it short — one sentence.";
        }

        if (!LOVABLE_API_KEY) {
          // Fallback if no API key
          const fallback: RetellResponse = {
            response_id: responseId,
            content: data.interaction_type === "reminder_required"
              ? "Are you still there?"
              : "I appreciate your time. How can I help you today?",
            content_complete: true,
            end_call: false,
          };
          socket.send(JSON.stringify(fallback));
          return;
        }

        // Stream response from Lovable AI
        try {
          const messages = buildMessages(promptForThisTurn, data.transcript || []);

          const aiResp = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages,
                stream: true,
                max_completion_tokens: 300,
                temperature: 0.7,
              }),
            }
          );

          if (!aiResp.ok) {
            console.error("AI gateway error:", aiResp.status, await aiResp.text());
            const errorResp: RetellResponse = {
              response_id: responseId,
              content: "I apologize, could you repeat that?",
              content_complete: true,
              end_call: false,
            };
            socket.send(JSON.stringify(errorResp));
            return;
          }

          // Parse SSE stream and forward tokens to Retell
          const reader = aiResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") break;

              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  // Send partial response to Retell
                  const partial: RetellResponse = {
                    response_id: responseId,
                    content: delta,
                    content_complete: false,
                    end_call: false,
                  };
                  socket.send(JSON.stringify(partial));
                }
              } catch {
                // Incomplete JSON, skip
              }
            }
          }

          // Send content_complete signal
          const complete: RetellResponse = {
            response_id: responseId,
            content: "",
            content_complete: true,
            end_call: false,
          };
          socket.send(JSON.stringify(complete));

          // Update transcript in DB with agent's response
          if (fullContent && contactId) {
            const updatedTranscript = data.transcript
              ? [...data.transcript, { role: "agent" as const, content: fullContent }]
              : [{ role: "agent" as const, content: fullContent }];
            lastTranscriptLength = updatedTranscript.length;
            await supabase
              .from("test_run_contacts")
              .update({ transcript: formatTranscript(updatedTranscript) })
              .eq("id", contactId);
          }
        } catch (err) {
          console.error("AI streaming error:", err);
          const errorResp: RetellResponse = {
            response_id: responseId,
            content: "I'm sorry, could you say that again?",
            content_complete: true,
            end_call: false,
          };
          socket.send(JSON.stringify(errorResp));
        }
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket closed");
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  return response;
});
