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
    // Twilio sends form-encoded data
    const contentType = req.headers.get("content-type") || "";
    let fromNumber: string;
    let messageBody: string;
    let twilioSid: string;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      fromNumber = params.get("From") || "";
      messageBody = params.get("Body") || "";
      twilioSid = params.get("MessageSid") || "";
    } else {
      const body = await req.json();
      fromNumber = body.From || body.from || "";
      messageBody = body.Body || body.body || "";
      twilioSid = body.MessageSid || body.message_sid || "";
    }

    console.log("WhatsApp webhook received from:", fromNumber, "body:", messageBody.slice(0, 100));

    if (!fromNumber || !messageBody) {
      return new Response("<Response></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // Strip "whatsapp:" prefix if present
    const cleanNumber = fromNumber.replace("whatsapp:", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find an agent with a matching whatsapp_number
    const { data: specs, error: specErr } = await supabase
      .from("agent_specs")
      .select("*, agent_projects!inner(id, org_id, name, source_text)")
      .not("whatsapp_number", "is", null);

    if (specErr) throw new Error(`Error fetching agent specs: ${specErr.message}`);

    // Match agent by whatsapp_number
    const matchedSpec = specs?.find((s: any) => {
      const waNum = (s.whatsapp_number || "").replace("whatsapp:", "");
      return waNum === cleanNumber || waNum === fromNumber;
    });

    // If no direct match, find any agent with whatsapp configured (for sandbox testing)
    const spec = matchedSpec || specs?.[0];

    if (!spec) {
      console.log("No WhatsApp-enabled agent found");
      return new Response("<Response></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    const orgId = spec.agent_projects.org_id;
    const projectId = spec.agent_projects.id;

    // Find or create conversation
    const { data: existingConvo } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("wa_number", cleanNumber)
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle();

    let conversationId: string;
    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      const { data: newConvo, error: convoErr } = await supabase
        .from("whatsapp_conversations")
        .insert({ org_id: orgId, project_id: projectId, wa_number: cleanNumber, status: "active" })
        .select("id")
        .single();
      if (convoErr) throw new Error(`Error creating conversation: ${convoErr.message}`);
      conversationId = newConvo.id;
    }

    // Store inbound message
    await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversationId,
        direction: "inbound",
        body: messageBody,
        twilio_message_sid: twilioSid,
        status: "received",
      });

    // Load conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from("whatsapp_messages")
      .select("direction, body")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Load agent knowledge summary
    const { data: knowledge } = await supabase
      .from("agent_knowledge")
      .select("content, category")
      .eq("project_id", projectId)
      .limit(10);

    const knowledgeContext = knowledge?.map((k: any) => `[${k.category}]: ${k.content}`).join("\n") || "";
    const agentName = spec.agent_projects.name || "AI Assistant";
    const agentSource = spec.agent_projects.source_text || "";
    const toneStyle = spec.tone_style || "professional and friendly";
    const useCase = spec.use_case || "general assistant";

    // Build conversation messages for AI
    const aiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: `You are ${agentName}, a WhatsApp AI assistant. Your role: ${useCase}.
Tone: ${toneStyle}.
Keep responses concise and conversational — this is WhatsApp, not email.
Use short paragraphs. Emojis are OK sparingly.

${agentSource ? `About the business:\n${agentSource}\n` : ""}
${knowledgeContext ? `Knowledge base:\n${knowledgeContext}\n` : ""}

If you don't know the answer, say so honestly and offer to connect them with a human.`,
      },
    ];

    // Add conversation history
    if (history) {
      for (const msg of history) {
        aiMessages.push({
          role: msg.direction === "inbound" ? "user" : "assistant",
          content: msg.body,
        });
      }
    }

    // Generate AI reply
    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      messages: aiMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const replyText = aiResponse.content || "Sorry, I couldn't process your message. Please try again.";

    // Send reply via Twilio
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioWhatsappNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsappNumber) {
      console.error("Twilio credentials not configured");
      // Still store the AI reply even if we can't send it
      await supabase.from("whatsapp_messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        body: replyText,
        status: "failed",
      });
      return new Response("<Response></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioBody = new URLSearchParams({
      From: twilioWhatsappNumber.startsWith("whatsapp:") ? twilioWhatsappNumber : `whatsapp:${twilioWhatsappNumber}`,
      To: fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`,
      Body: replyText,
    });

    const twilioResp = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioBody.toString(),
    });

    const twilioResult = await twilioResp.json();
    const outboundSid = twilioResult.sid || null;

    // Store outbound message
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      body: replyText,
      twilio_message_sid: outboundSid,
      status: twilioResp.ok ? "sent" : "failed",
    });

    // Update conversation timestamp
    await supabase
      .from("whatsapp_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Return empty TwiML (we already sent the reply via API)
    return new Response("<Response></Response>", {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("receive-whatsapp-webhook error:", err);
    return new Response("<Response></Response>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});
