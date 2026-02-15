import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to_number, project_id, message, conversation_id } = await req.json();

    if (!to_number || !message) {
      throw new Error("to_number and message are required");
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioWhatsappNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsappNumber) {
      throw new Error("Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const toFormatted = to_number.startsWith("whatsapp:") ? to_number : `whatsapp:${to_number}`;
    const fromFormatted = twilioWhatsappNumber.startsWith("whatsapp:") ? twilioWhatsappNumber : `whatsapp:${twilioWhatsappNumber}`;

    const twilioBody = new URLSearchParams({
      From: fromFormatted,
      To: toFormatted,
      Body: message,
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

    if (!twilioResp.ok) {
      console.error("Twilio error:", twilioResult);
      throw new Error(`Twilio API error: ${twilioResult.message || "Unknown error"}`);
    }

    // Store the outbound message if we have a conversation_id
    if (conversation_id) {
      await supabase.from("whatsapp_messages").insert({
        conversation_id,
        direction: "outbound",
        body: message,
        twilio_message_sid: twilioResult.sid,
        status: "sent",
      });

      await supabase
        .from("whatsapp_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation_id);
    }

    return new Response(
      JSON.stringify({ success: true, message_sid: twilioResult.sid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp-message error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
