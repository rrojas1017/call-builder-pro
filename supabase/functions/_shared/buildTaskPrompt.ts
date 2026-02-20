// Shared prompt builder — single source of truth for test runs, campaigns, and client preview.

export interface AgentSpec {
  disclosure_text?: string | null;
  consent_required?: boolean;
  must_collect_fields?: string[] | null;
  qualification_rules?: Record<string, any> | null;
  disqualification_rules?: Record<string, any> | null;
  transfer_phone_number?: string | null;
  tone_style?: string | null;
  language?: string | null;
  opening_line?: string | null;
  persona_name?: string | null;
  transfer_required?: boolean | null;
  mode?: string | null;
  use_case?: string | null;
  success_definition?: string | null;
  humanization_notes?: string[];
}

export interface KnowledgeEntry {
  category: string;
  content: string;
}

const HEALTH_KEYWORDS = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment'];

export function isHealthAgent(spec: AgentSpec): boolean {
  const uc = (spec.use_case || spec.mode || "").toLowerCase();
  return HEALTH_KEYWORDS.some(kw => uc.includes(kw));
}

/** Compact FPL + SEP rules (~800 chars instead of ~3,000) */
export function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2025): Income must be 100-400% of Federal Poverty Level. Reference: Single=$14.6k-$58.3k; Family of 4=$30k-$120k. Add $5.1k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

/** Compress knowledge entries: group by category, truncate, limit */
export function buildCompactKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";
  const grouped: Record<string, string[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    if (grouped[e.category].length >= 4) continue;
    const text = e.content.length > 150 ? e.content.substring(0, 147) + "..." : e.content;
    grouped[e.category].push(text);
  }
  const labels: Record<string, string> = {
    product_knowledge: "PRODUCT KNOWLEDGE",
    objection_handling: "OBJECTION HANDLING",
    industry_insight: "INDUSTRY INSIGHTS",
    competitor_info: "COMPETITOR AWARENESS",
    winning_pattern: "WINNING PATTERNS",
    conversation_technique: "CONVERSATION TIPS",
  };
  const parts: string[] = [];
  for (const [cat, items] of Object.entries(grouped)) {
    const label = labels[cat] || cat.toUpperCase();
    parts.push(`${label}: ${items.join(". ")}`);
  }
  return parts.join("\n");
}

/** Condense humanization notes into a single style paragraph */
export function buildCompactStyle(notes: string[]): string {
  if (!notes.length) return "Be naturally warm and conversational.";
  const condensed = notes.slice(0, 10).map(n => {
    const clean = n.replace(/^\d+\.\s*/, "").trim();
    return clean.length > 80 ? clean.substring(0, 77) + "..." : clean;
  });
  return condensed.join(". ") + ".";
}

export function buildTaskPrompt(spec: AgentSpec, knowledge: KnowledgeEntry[], knowledgeBriefing?: string): string {
  const purpose = spec.use_case || spec.success_definition || "Conduct a professional outbound call.";
  const discl = spec.disclosure_text || "";
  const tone = spec.tone_style || "Friendly, professional, empathetic";
  const transferNum = spec.transfer_phone_number || "";
  const transferDigits = transferNum.replace(/\D/g, "");

  const humanNotes = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
  const styleGuide = buildCompactStyle(humanNotes);

  // Parse fields
  const rawFields = spec.must_collect_fields;
  let fields: string[] = [];
  if (Array.isArray(rawFields)) {
    fields = rawFields;
  } else if (typeof rawFields === "string") {
    try { const p = JSON.parse(rawFields); if (Array.isArray(p)) fields = p; } catch { /* skip */ }
  }

  // Inject name confirmation after consent if not already present
  if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('confirm') && f.toLowerCase().includes('name'))) {
    const consentIdx = fields.findIndex((f: string) => f.toLowerCase().includes('consent'));
    if (consentIdx >= 0) {
      fields.splice(consentIdx + 1, 0, "Can I confirm your full name?");
    } else {
      fields.unshift("Can I confirm your full name?");
    }
  }

  // Inject email collection near end if not already present
  if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('email'))) {
    const insertAt = Math.max(fields.length - 1, 0);
    fields.splice(insertAt, 0, "What's the best email address to reach you at? We'll send you a quick summary of what we covered and any next steps.");
  }

  const qualRules = spec.qualification_rules
    ? (typeof spec.qualification_rules === "string" ? spec.qualification_rules : JSON.stringify(spec.qualification_rules, null, 2))
    : null;
  const disqualRules = spec.disqualification_rules
    ? (typeof spec.disqualification_rules === "string" ? spec.disqualification_rules : JSON.stringify(spec.disqualification_rules, null, 2))
    : null;

  const personaName = spec.persona_name?.trim() || null;

  // Substitute {{agent_name}} in opening_line before building the prompt
  const resolvedOpeningLine = spec.opening_line
    ? spec.opening_line.replace(/\{\{agent_name\}\}/gi, personaName || "")
    : null;

  let prompt = `You are a REAL PERSON on a phone call — not AI, not a robot.`;

  if (personaName) {
    prompt += `\n\nPERSONA: Your name is ${personaName}. Always introduce yourself by this name naturally. Do NOT say you are AI, automated, a bot, or a robot.`;
  }

  prompt += `\n\nINTERACTION STYLE: ${styleGuide}

PURPOSE: ${purpose}

RULES:
- Tone: ${tone}
- Sound natural: vary sentence length, react genuinely, use casual transitions ("Gotcha", "Makes sense").
- Use caller's name occasionally. Acknowledge each answer before the next question.
- Never guess or assume answers.`;

  if (resolvedOpeningLine) {
    const filledGuide = resolvedOpeningLine.replace(/\{\{first_name\}\}/gi, "[caller's name]");
    prompt += `\n\nOPENING GUIDE: Start with something like the line below, but adapt it naturally — do NOT read it word-for-word as a script. Ask the caller's name early if you don't already know it.\nOpening guide: "${filledGuide}"`;
  }

  // Knowledge: prefer AI briefing, fallback to compact raw knowledge
  if (knowledgeBriefing) {
    prompt += `\n\nKNOWLEDGE BRIEFING:\n${knowledgeBriefing}`;
  } else {
    const knowledgeSection = buildCompactKnowledge(knowledge);
    if (knowledgeSection) {
      prompt += `\n\nDOMAIN KNOWLEDGE:\n${knowledgeSection}`;
    }
  }

  if (discl) {
    prompt += `\n\nDISCLOSURE (read at start): "${discl}"`;
  }

  if (fields.length > 0) {
    prompt += `\n\nCOLLECT (in order):\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    prompt += `\nZIP CODE: Must be exactly 5 digits. After caller says it, repeat it back: "Just to confirm, that's [zip], correct?" If unclear or fewer/more than 5 digits, ask again: "I want to make sure I have that right -- could you repeat your zip code?"`;
  }

  // Health-specific compact rules
  if (isHealthAgent(spec)) {
    prompt += `\n\n${buildCompactFplSep()}`;
    if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('life event') || f.toLowerCase().includes('qle'))) {
      prompt += `\nASK: "Have you recently had any life changes like losing coverage, marriage, baby, or moving?"`;
    }
  }

  if (qualRules) prompt += `\n\nQUALIFICATION:\n${qualRules}`;
  if (disqualRules) prompt += `\n\nDISQUALIFICATION:\n${disqualRules}`;

  if (transferDigits.length >= 10) {
    const formatted = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If qualified, confirm the transfer CLEARLY and COMPLETELY before initiating. Say something like "Great news, you qualify! I'm going to connect you with a specialist now." WAIT for the sentence to finish — do NOT start the transfer mid-sentence. Then transfer to ${formatted}. Never cut off your own confirmation.`;
  }

  prompt += `\n\nFALLBACK: After 2 failed attempts to collect info, end politely.`;
  prompt += `\nSUMMARY: After call, JSON with all collected fields + caller_name.`;

  return prompt;
}

export function replaceTemplateVars(text: string, contact: { name: string; phone: string }, personaName?: string | null): string {
  const parts = (contact.name || "").trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return text
    .replace(/\{\{agent_name\}\}/gi, personaName || "")
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{last_name\}\}/gi, lastName)
    .replace(/\{\{name\}\}/gi, contact.name || "")
    .replace(/\{\{phone\}\}/gi, contact.phone || "");
}
