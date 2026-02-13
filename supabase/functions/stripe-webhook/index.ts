import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    // If STRIPE_WEBHOOK_SECRET is set, verify signature
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      // Fallback: parse body directly (less secure, for dev)
      event = JSON.parse(body) as Stripe.Event;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      const topupAmount = parseFloat(session.metadata?.topup_amount || "0");

      if (!orgId || !topupAmount) {
        console.error("Missing metadata on checkout session:", session.id);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Increment credits_balance
      const { data: org } = await supabase
        .from("organizations")
        .select("credits_balance")
        .eq("id", orgId)
        .single();

      const newBalance = (org?.credits_balance || 0) + topupAmount;

      await supabase
        .from("organizations")
        .update({ credits_balance: newBalance })
        .eq("id", orgId);

      // Insert credit transaction
      await supabase.from("credit_transactions").insert({
        org_id: orgId,
        amount: topupAmount,
        type: "topup",
        description: `Credit top-up via Stripe`,
        stripe_session_id: session.id,
      });

      console.log(`Credited $${topupAmount} to org ${orgId}. New balance: $${newBalance}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("stripe-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
