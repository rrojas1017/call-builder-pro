import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, answers } = await req.json();
    if (!project_id || !answers) throw new Error("project_id and answers required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save answers to wizard_questions
    for (const ans of answers) {
      await supabase
        .from("wizard_questions")
        .update({ answer: ans.answer })
        .eq("project_id", project_id)
        .eq("order_index", ans.order_index);
    }

    // Map answers to agent_specs using keyword detection on the question text
    const updates: Record<string, any> = {};
    let humanizationNotes: string[] = [];

    for (const ans of answers) {
      const q = (ans.question || "").toLowerCase();
      const a = ans.answer || "";
      if (!a.trim()) continue;

      // Company/product context → business_rules.company_context
      // en: company, product, service, offer, represent
      // es: empresa, producto, servicio, oferta, representar
      // fr: entreprise, produit, service, offre, représenter
      // pt: empresa, produto, serviço, oferta, representar
      // de: unternehmen, produkt, dienst, angebot, vertreten
      // it: azienda, prodotto, servizio, offerta, rappresentare
      if (q.includes("company") || q.includes("product") || q.includes("service") || q.includes("offer") || q.includes("represent") ||
          q.includes("empresa") || q.includes("producto") || q.includes("servicio") || q.includes("oferta") || q.includes("representar") ||
          q.includes("entreprise") || q.includes("produit") || q.includes("représenter") ||
          q.includes("produto") || q.includes("serviço") ||
          q.includes("unternehmen") || q.includes("produkt") || q.includes("angebot") ||
          q.includes("azienda") || q.includes("offerta")) {
        updates.business_rules = { ...(updates.business_rules || {}), company_context: a };
      }

      // Target audience → business_rules.target_audience
      // es: ideal, audiencia, objetivo, quién, cliente
      // fr: idéal, audience, cible, qui, client
      if (q.includes("ideal") || q.includes("audience") || q.includes("target") || q.includes("who") || q.includes("customer") ||
          q.includes("audiencia") || q.includes("objetivo") || q.includes("quién") || q.includes("cliente") ||
          q.includes("cible") || q.includes("qui") || q.includes("client") ||
          q.includes("alvo") || q.includes("cliente") ||
          q.includes("zielgruppe") || q.includes("kunde") ||
          q.includes("destinatario") || q.includes("cliente")) {
        updates.business_rules = { ...(updates.business_rules || {}), target_audience: a };
      }

      // Objections → business_rules.objection_handling
      // es: objeción, resistencia / fr: objection / pt: objeção / de: einwand / it: obiezione
      if (q.includes("objection") || q.includes("pushback") || q.includes("resist") ||
          q.includes("objeción") || q.includes("resistencia") ||
          q.includes("objection") || q.includes("résistance") ||
          q.includes("objeção") ||
          q.includes("einwand") || q.includes("widerstand") ||
          q.includes("obiezione")) {
        updates.business_rules = { ...(updates.business_rules || {}), objection_handling: a };
      }

      // Forbidden phrases/topics → humanization_notes
      // es: nunca, evitar, prohibido / fr: jamais, éviter, interdit / pt: nunca, evitar / de: niemals, vermeiden / it: mai, evitare
      if (q.includes("never") || q.includes("avoid") || q.includes("forbidden") || q.includes("don't") || q.includes("not say") || q.includes("not do") ||
          q.includes("nunca") || q.includes("evitar") || q.includes("prohibido") || q.includes("jamás") ||
          q.includes("jamais") || q.includes("éviter") || q.includes("interdit") ||
          q.includes("niemals") || q.includes("vermeiden") || q.includes("verboten") ||
          q.includes("mai") || q.includes("vietato")) {
        humanizationNotes.push(`NEVER say or do: ${a}`);
      }

      // Tone/persona → tone_style
      // es: tono, persona, personalidad, estilo / fr: ton, personnalité, style / pt: tom, personalidade / de: ton, stil / it: tono, stile
      if (q.includes("tone") || q.includes("persona") || q.includes("personality") || q.includes("style") || q.includes("voice") ||
          q.includes("tono") || q.includes("personalidad") || q.includes("estilo") ||
          q.includes("personalité") || q.includes("personnalité") ||
          q.includes("personalidade") ||
          q.includes("persönlichkeit") || q.includes("stil") ||
          q.includes("personalità")) {
        updates.tone_style = a;
      }

      // Success definition → success_definition
      // es: éxito, resultado / fr: succès, résultat / pt: sucesso / de: erfolg / it: successo
      if (q.includes("success") || q.includes("true win") || q.includes("outcome") || q.includes("matter") ||
          q.includes("éxito") || q.includes("resultado") || q.includes("importa") ||
          q.includes("succès") || q.includes("résultat") ||
          q.includes("sucesso") ||
          q.includes("erfolg") || q.includes("ergebnis") ||
          q.includes("risultato")) {
        updates.success_definition = a;
      }

      // Compliance/legal → disclosure_text + business_rules.compliance
      // es: cumplimiento, legal, regulatorio, divulgación / fr: conformité, légal, divulgation / pt: conformidade / de: compliance, rechtlich / it: conformità, legale
      if (q.includes("compliance") || q.includes("legal") || q.includes("regulatory") || q.includes("disclosure") || q.includes("requirement") ||
          q.includes("cumplimiento") || q.includes("regulatorio") || q.includes("divulgación") || q.includes("requisito") ||
          q.includes("conformité") || q.includes("légal") || q.includes("divulgation") ||
          q.includes("conformidade") || q.includes("regulatório") ||
          q.includes("rechtlich") || q.includes("vorschrift") ||
          q.includes("conformità") || q.includes("legale") || q.includes("normativa")) {
        updates.disclosure_text = a;
        updates.disclosure_required = true;
        updates.business_rules = { ...(updates.business_rules || {}), compliance_notes: a };
      }

      // Business hours → business_hours
      // es: horas, horario, días, zona horaria / fr: heures, jours, fuseau / pt: horas, dias, fuso / de: stunden, tage, zeitzone / it: ore, giorni, fuso orario
      if (q.includes("hour") || q.includes("time") || q.includes("day") || q.includes("calling hour") || q.includes("timezone") ||
          q.includes("hora") || q.includes("horario") || q.includes("días") || q.includes("zona horaria") ||
          q.includes("heures") || q.includes("jours") || q.includes("fuseau") ||
          q.includes("fuso") || q.includes("dias") ||
          q.includes("stunden") || q.includes("zeitzone") ||
          q.includes("orario") || q.includes("giorno") || q.includes("fuso orario")) {
        updates.business_hours = { description: a, timezone: "America/New_York", start: "09:00", end: "18:00", days: ["mon", "tue", "wed", "thu", "fri"] };
      }
    }

    // Merge humanization_notes
    if (humanizationNotes.length > 0) {
      updates.humanization_notes = humanizationNotes;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("agent_specs")
        .update({ ...updates, version: 1 })
        .eq("project_id", project_id);
      if (error) throw error;
    }

    // Return updated spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    return new Response(JSON.stringify({ spec }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("save-wizard-answers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
