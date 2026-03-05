import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tryEndCall(callId: string, apiKey: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`https://api.retellai.com/v2/end-call/${callId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function tryDeleteCall(callId: string, apiKey: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`https://api.retellai.com/v2/delete-call/${callId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { call_id, contact_id } = await req.json();
    if (!call_id) throw new Error("call_id is required");

    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");

    let terminated = false;
    let method = "";

    // Attempt 1: end-call
    const attempt1 = await tryEndCall(call_id, RETELL_API_KEY);
    console.log(`end-call attempt 1: status=${attempt1.status}`, JSON.stringify(attempt1.body));

    if (attempt1.status >= 200 && attempt1.status < 300) {
      terminated = true;
      method = "end-call";
    } else if (attempt1.status === 404) {
      // Retry after 1s (propagation delay)
      console.log("Got 404, retrying after 1s…");
      await delay(1000);

      const attempt2 = await tryEndCall(call_id, RETELL_API_KEY);
      console.log(`end-call attempt 2: status=${attempt2.status}`, JSON.stringify(attempt2.body));

      if (attempt2.status >= 200 && attempt2.status < 300) {
        terminated = true;
        method = "end-call-retry";
      } else {
        // Fallback: delete-call to force removal
        console.log("end-call retry failed, trying delete-call fallback…");
        const delResult = await tryDeleteCall(call_id, RETELL_API_KEY);
        console.log(`delete-call fallback: status=${delResult.status}`, JSON.stringify(delResult.body));

        if (delResult.status >= 200 && delResult.status < 300) {
          terminated = true;
          method = "delete-call";
        }
      }
    } else {
      // Non-404 error
      throw new Error(`Retell API error: ${attempt1.body?.message || attempt1.body?.error_message || attempt1.status}`);
    }

    console.log(`Call ${call_id}: terminated=${terminated}, method=${method}`);

    // Update test_run_contacts status if contact_id provided
    if (contact_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("test_run_contacts")
        .update({ status: "cancelled" })
        .eq("id", contact_id);
    }

    return new Response(JSON.stringify({ success: terminated, terminated, method }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stop-call error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
