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
  verbatim_script?: string | null;
  persona_name?: string | null;
  transfer_required?: boolean | null;
  mode?: string | null;
  use_case?: string | null;
  success_definition?: string | null;
  humanization_notes?: string[];
  business_rules?: Record<string, any> | null;
}

export interface KnowledgeEntry {
  category: string;
  content: string;
}

const HEALTH_KEYWORDS = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment'];

const INTRO_PATTERNS = [
  /\bthis is (\w+)/i,
  /\bmy name is (\w+)/i,
  /\bI'm (\w+)/i,
  /\bI am (\w+)/i,
  /\bsoy (\w+)/i,
  /\bme llamo (\w+)/i,
  /\bmi nombre es (\w+)/i,
  /\bje suis (\w+)/i,
  /\bmeu nome .+ (\w+)/i,
  /\bich bin (\w+)/i,
  /\bmi chiamo (\w+)/i,
];

// Common words that follow intro patterns but are NOT names
const SKIP_WORDS = new Set([
  "calling", "reaching", "contacting", "following", "checking",
  "today", "here", "back", "just", "also", "currently", "still",
  "very", "really", "so", "not", "the", "a", "an", "your", "our",
  "glad", "happy", "pleased", "sorry", "excited", "thrilled",
  "going", "trying", "looking", "wanting", "hoping", "working",
  "with", "from", "at", "in", "on", "for",
]);

/** Runtime safety net: replace hardcoded names that don't match persona */
function runtimeGuardResolvedLine(resolvedLine: string, personaName: string): string {
  if (!resolvedLine || !personaName) return resolvedLine;
  const trimmed = personaName.trim();
  if (!trimmed) return resolvedLine;
  const personaFirstWord = trimmed.split(/\s+/)[0].toLowerCase();
  for (const pattern of INTRO_PATTERNS) {
    const match = resolvedLine.match(pattern);
    if (match && match[1]) {
      const foundName = match[1];
      if (SKIP_WORDS.has(foundName.toLowerCase())) continue;
      if (foundName.toLowerCase() === trimmed.toLowerCase()) continue;
      if (foundName.toLowerCase() === personaFirstWord) continue;
      return resolvedLine.replace(foundName, trimmed);
    }
  }
  return resolvedLine;
}

export function isHealthAgent(spec: AgentSpec): boolean {
  const uc = (spec.use_case || spec.mode || "").toLowerCase();
  return HEALTH_KEYWORDS.some(kw => uc.includes(kw));
}

/** Compact FPL + SEP rules with 2026 data and positive response logic */
export function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2026): Income must be 100-400% of Federal Poverty Level. Reference: Single=$15.1k-$60.2k; Family of 4=$31.2k-$124.8k. Add $5.4k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

FPL RESPONSE RULE: After collecting household size AND estimated annual income, calculate approximate FPL %. Respond positively:
- If FPL ~100-150%: "Great news — based on your household and income, you likely qualify for a subsidy that could cover your entire monthly premium!"
- If FPL ~150-250%: "That's good news — you qualify for a subsidy that should cover a significant portion of your monthly premium."
- If FPL ~250-400%: "You still qualify for a subsidy that covers a meaningful portion of your premium costs."
- Below 100%: Check if they were denied Medicaid. If yes, they may still qualify. If no, guide them to apply for Medicaid first.
- Above 400%: Let them know they may not qualify for premium assistance but can still enroll at full price.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

/** Compress knowledge entries: group by category, smart-truncate, limit */
export function buildCompactKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";
  const grouped: Record<string, string[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    if (grouped[e.category].length >= 5) continue;
    // Smart truncation: prefer cutting at sentence boundaries, higher limit (300 chars)
    let text = e.content;
    if (text.length > 300) {
      const cutPoint = text.lastIndexOf(".", 297);
      text = cutPoint > 150 ? text.substring(0, cutPoint + 1) : text.substring(0, 297) + "...";
    }
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

export function buildTaskPrompt(spec: AgentSpec, knowledge: KnowledgeEntry[], knowledgeBriefing?: string, callerName?: string, useDynamicCallerName: boolean = false): string {
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

  const qualRules = spec.qualification_rules
    ? (typeof spec.qualification_rules === "string" ? spec.qualification_rules : JSON.stringify(spec.qualification_rules, null, 2))
    : null;
  const disqualRules = spec.disqualification_rules
    ? (typeof spec.disqualification_rules === "string" ? spec.disqualification_rules : JSON.stringify(spec.disqualification_rules, null, 2))
    : null;

  const personaName = spec.persona_name?.trim() || null;

  // Substitute {{agent_name}} and [Agent Name] in opening_line before building the prompt
  let resolvedOpeningLine = spec.opening_line
    ? spec.opening_line
        .replace(/\{\{agent_name\}\}/gi, personaName || "")
        .replace(/\[Agent Name\]/gi, personaName || "")
    : null;

  // Runtime safety net: catch hardcoded name mismatches
  if (resolvedOpeningLine && personaName) {
    resolvedOpeningLine = runtimeGuardResolvedLine(resolvedOpeningLine, personaName);
  }

  // If opening_line already addresses the caller by name or asks for it, do NOT re-inject a name question.
  const openingAsksForName = resolvedOpeningLine
    ? /nombre|name|\{\{first_name\}\}/i.test(resolvedOpeningLine)
    : false;

  if (fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('name'))) {
    if (useDynamicCallerName) {
      // We already have the contact's name from the dial list — never inject a name-collection field.
    } else if (openingAsksForName) {
      const consentIdx = fields.findIndex((f: string) => f.toLowerCase().includes('consent'));
      const insertAt = consentIdx >= 0 ? consentIdx + 1 : 0;
      fields.splice(insertAt, 0, "(Caller's name should already be known from the opening — confirm naturally only if still unclear, do NOT re-ask)");
    } else if (!callerName?.trim()) {
      const consentIdx = fields.findIndex((f: string) => f.toLowerCase().includes('consent'));
      if (consentIdx >= 0) {
        fields.splice(consentIdx + 1, 0, "Can I confirm your full name?");
      } else {
        fields.unshift("Can I confirm your full name?");
      }
    }
  }

  // Only inject email collection for English agents (not Spanish/other languages)
  const lang = (spec.language || "en").toLowerCase();
  const isEnglish = lang === "en" || lang === "en-us";
  // Guard email injection: skip if business_rules forbid it
  const rulesStr = JSON.stringify(spec.business_rules || {}).toLowerCase();
  const forbidsEmail = rulesStr.includes("not ask for email") || rulesStr.includes("no email") || rulesStr.includes("don't ask for email") || rulesStr.includes("do not collect email");
  if (isEnglish && !forbidsEmail && fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('email'))) {
    fields.push("Before I connect you, what's the best email address to send your plan details and next steps to?");
  }

  let prompt = `You are a REAL PERSON on a phone call — not AI, not a robot.`;

  if (personaName) {
    prompt += `\n\nPERSONA: Your name is ${personaName}. Always introduce yourself by this name naturally. Do NOT say you are AI, automated, a bot, or a robot.`;
  }

  // Caller name awareness — explicit instruction so AI never guesses
  const trimmedCallerName = callerName?.trim() || "";
  if (useDynamicCallerName) {
    prompt += `\n\nCALLER: The person you are calling is {{contact_name}} (first name: {{first_name}}). Use their first name naturally during the conversation. You ALREADY HAVE their name from your call list — do NOT ask for it, do NOT ask them to confirm it, do NOT spell it back. Skip any "may I have your name" step entirely.`;
  } else if (trimmedCallerName) {
    prompt += `\n\nCALLER: The person you are calling is ${trimmedCallerName}. Use their name naturally during the conversation — but do NOT ask for it again, you already have it.`;
  } else {
    prompt += `\n\nCALLER: You do NOT have this person's name yet. Ask for their name early and naturally in the conversation — do NOT skip this step.`;
  }

  // Detect script-anchored mode early so we can reorganize the prompt around it.
  const rawVerbatim = (spec as any).verbatim_script?.trim?.() || "";
  const scriptMode = !!rawVerbatim;

  // ── SCRIPT-ANCHORED MODE: script becomes the spine of the call ──
  if (scriptMode) {
    let filledScript = rawVerbatim
      .replace(/\{\{agent_name\}\}/gi, personaName || "")
      .replace(/\[Agent Name\]/gi, personaName || "");
    if (!useDynamicCallerName) {
      const nameHint = trimmedCallerName ? trimmedCallerName.split(" ")[0] : "";
      filledScript = filledScript
        .replace(/\{\{first_name\}\}/gi, nameHint)
        .replace(/\{\{contact_name\}\}/gi, trimmedCallerName);
    }
    // else: leave {{first_name}}/{{contact_name}} intact — Retell substitutes per call.

    // Derive the call's purpose for the circle-back instruction.
    const scriptPurpose = (spec.success_definition?.trim()
      || rawVerbatim.split(/[.!?\n]/)[0]?.trim()
      || purpose).slice(0, 240);

    prompt += `\n\n══════════════════════════════════════════════
SCRIPT-ANCHORED CALL (HIGHEST PRIORITY)
══════════════════════════════════════════════
This call REVOLVES around the script below. Your job is to deliver it word-for-word, then steer the conversation back to its goal whenever the caller drifts. Everything else in this prompt is supporting context for that script — not competing instructions.

VERBATIM SCRIPT — deliver EXACTLY as written, word-for-word, before doing anything else. Do NOT paraphrase, summarize, or skip any part:
"""
${filledScript}
"""

CIRCLE-BACK BEHAVIOR: The caller will interrupt, ask questions, or go on tangents. Handle each one briefly and warmly, then ALWAYS bring the conversation back to the script's purpose: ${scriptPurpose}. The call is not over until either (a) the script's goal is achieved, or (b) the caller clearly declines.`;

    prompt += `\n\nDELIVERY STYLE (script-anchored):
- Tone: ${tone}
- Stay in the script's voice and rhythm — do not flatten it into a generic interview.
- Acknowledge answers briefly ("Got it", "Makes sense"), then return to the script's next beat.
- If the caller objects or asks something off-script, answer it concisely, then bridge back: "Anyway, as I was saying…" or similar.
- One question per turn — wait for the answer before continuing.
- NEVER re-introduce yourself or re-state company name after the script's opening.
- NEVER re-ask for information the caller already provided.`;
  } else {
    // ── STANDARD MODE: original prompt structure ──
    prompt += `\n\nINTERACTION STYLE: ${styleGuide}

PURPOSE: ${purpose}

RULES:
- Tone: ${tone}
- Sound natural: vary sentence length, react genuinely, use casual transitions ("Gotcha", "Makes sense").
- Use caller's name occasionally. Acknowledge each answer before the next question.
- Never guess or assume answers.
- NEVER re-introduce yourself or re-state company name after the opening — it was already said.
- NEVER re-ask for information the caller already provided earlier in the call.
- If you already mentioned the recording disclosure in your opening, do NOT repeat it.
- PACING: Do NOT rapid-fire through questions. After each answer, pause and acknowledge naturally ("Got it", "That helps", "Okay, great") before moving to the next question. When shifting topics (e.g., from personal info to income), use a brief transition like "Alright, just a couple more things..." to signal the change.
- If the caller gives a detailed answer or shares something personal, react to it briefly before continuing — do not immediately jump to the next field.
- ONE QUESTION PER TURN: Never ask more than one question in a single response. Ask one thing, then STOP and wait for the caller to answer before continuing.`;
  }

  // Build business rules text
  let businessRulesBlock = "";
  let businessRulesCoverFpl = false;
  const rawBr = spec.business_rules;
  if (rawBr) {
    let brText = "";
    if (typeof rawBr === "string") {
      brText = rawBr;
    } else if (typeof rawBr === "object" && Object.keys(rawBr).length > 0) {
      const br = rawBr as any;
      if (Array.isArray(br.rules) && br.rules.length > 0) {
        brText = br.rules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n");
      } else if (typeof br.text === "string") {
        brText = br.text;
      } else {
        brText = Object.entries(rawBr)
          .filter(([k]) => k !== "rules")
          .map(([key, val]) => `- ${key}: ${val}`)
          .join("\n");
      }
    }
    if (brText.trim()) {
      businessRulesBlock = brText;
      const brLower = brText.toLowerCase();
      businessRulesCoverFpl = brLower.includes("fpl") || brLower.includes("federal poverty");
    }
  }

  // Opening guide — only when no verbatim script is present
  if (!scriptMode && resolvedOpeningLine) {
    let filledGuide = resolvedOpeningLine;
    if (!useDynamicCallerName) {
      const nameHint = trimmedCallerName ? trimmedCallerName.split(" ")[0] : "(caller's name — ask if unknown)";
      filledGuide = filledGuide.replace(/\{\{first_name\}\}/gi, nameHint);
    }
    prompt += `\n\nOPENING GUIDE: Start with something like the line below, but adapt it naturally — do NOT read it word-for-word as a script.\nOpening guide: "${filledGuide}"`;
    prompt += `\nAFTER THE OPENING: Once you deliver your opening line, proceed DIRECTLY into your first question or field collection. Do NOT pause and wait for a response unless your opening line ends with a direct question. Flow naturally from the introduction into the conversation.`;
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
    prompt += `\n\nDISCLOSURE (mention once, naturally during opening — do NOT repeat): "${discl}"`;
  }

  if (fields.length > 0) {
    const collectHeader = scriptMode
      ? `AFTER you've delivered the script and the caller is engaged, weave these data points into the natural conversation flow (do NOT switch into interview mode, do NOT abandon the script's narrative to fire questions):`
      : `COLLECT (in order):`;
    prompt += `\n\n${collectHeader}\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    // Only inject ZIP code validation for US English agents
    if (isEnglish && fields.some((f: string) => f.toLowerCase().includes('zip'))) {
      prompt += `\nZIP CODE: Must be exactly 5 digits. After caller says it, repeat it back: "Just to confirm, that's [zip], correct?" If unclear or fewer/more than 5 digits, ask again: "I want to make sure I have that right -- could you repeat your zip code?"`;
    }
  }

  // Health-specific compact rules — skip if business rules already cover FPL
  if (isHealthAgent(spec) && !businessRulesCoverFpl) {
    const fplPrefix = scriptMode
      ? `REFERENCE ONLY — use this data to answer questions if asked, but do NOT pivot the call into an FPL calculation unless the script asks you to.\n\n`
      : ``;
    prompt += `\n\n${fplPrefix}${buildCompactFplSep()}`;
    if (!scriptMode && fields.length > 0 && !fields.some((f: string) => f.toLowerCase().includes('life event') || f.toLowerCase().includes('qle'))) {
      prompt += `\nASK: "Have you recently had any life changes like losing coverage, marriage, baby, or moving?"`;
    }
  }

  if (qualRules) prompt += `\n\nQUALIFICATION:\n${qualRules}`;
  if (disqualRules) prompt += `\n\nDISQUALIFICATION:\n${disqualRules}`;

  if (transferDigits.length >= 10) {
    const formatted = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If qualified, confirm the transfer CLEARLY and COMPLETELY before initiating. Say something like "Great news, you qualify! I'm going to connect you with a specialist now." WAIT for the sentence to finish — do NOT start the transfer mid-sentence. Then transfer to ${formatted}. Never cut off your own confirmation.`;
  }

  // Business rules — framing depends on whether a script anchors the call
  if (businessRulesBlock) {
    const brHeader = scriptMode
      ? `BUSINESS RULES — apply these while delivering the script, never in conflict with it:`
      : `BUSINESS RULES (HIGHEST PRIORITY — these override ANY conflicting instruction above, including qualification rules, field collection, and default behaviors):`;
    prompt += `\n\n${brHeader}\n${businessRulesBlock}`;
  }

  prompt += `\n\nFALLBACK: After 2 failed attempts to collect info, end politely.`;
  prompt += `\nSUMMARY: After call, JSON with all collected fields + caller_name.`;

  return prompt;
}

/**
 * Build a clean begin_message for Retell's static LLM field.
 * Strips {{first_name}} (since it varies per contact and can't be resolved statically),
 * resolves {{agent_name}}, and cleans up punctuation artifacts.
 */
export function resolveBeginMessage(openingLine: string, personaName?: string | null): string {
  let msg = openingLine;
  // Resolve agent name
  msg = msg.replace(/\{\{agent_name\}\}/gi, personaName || "");
  msg = msg.replace(/\[Agent Name\]/gi, personaName || "");
  // Strip {{first_name}} and nearby artifacts (e.g. "Hey {{first_name}}, " → "Hey, ")
  msg = msg.replace(/\{\{first_name\}\}\s*,?\s*/gi, "");
  msg = msg.replace(/\{\{last_name\}\}\s*,?\s*/gi, "");
  msg = msg.replace(/\{\{name\}\}\s*,?\s*/gi, "");
  // Clean up double spaces and leading/trailing commas
  msg = msg.replace(/\s{2,}/g, " ").trim();
  msg = msg.replace(/^,\s*/, "").replace(/\s*,$/, "");
  // Runtime guard: fix hardcoded name mismatches
  if (personaName) {
    msg = runtimeGuardResolvedLine(msg, personaName);
  }
  return msg;
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
