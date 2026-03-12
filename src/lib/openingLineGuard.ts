/**
 * Detects hardcoded names in opening lines that don't match the persona name,
 * and replaces them with the {{agent_name}} placeholder.
 * 
 * This guard is ADVISORY — callers should use `wasFixed` to warn users,
 * not silently overwrite their input.
 */

interface GuardResult {
  corrected: string;
  wasFixed: boolean;
  oldName?: string;
}

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

export function guardOpeningLine(openingLine: string, personaName: string): GuardResult {
  if (!openingLine || !personaName) {
    return { corrected: openingLine, wasFixed: false };
  }

  const trimmedPersona = personaName.trim();
  if (!trimmedPersona) {
    return { corrected: openingLine, wasFixed: false };
  }

  let line = openingLine;
  let wasFixed = false;
  let oldName: string | undefined;

  // Step 1: Fix duplicate {{agent_name}} placeholders — keep only the first occurrence
  const placeholderCount = (line.match(/\{\{agent_name\}\}/g) || []).length;
  if (placeholderCount > 1) {
    let first = true;
    line = line.replace(/\{\{agent_name\}\}/g, (match) => {
      if (first) { first = false; return match; }
      return "";
    });
    // Clean up resulting double spaces, orphaned commas, and awkward punctuation
    line = line.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
    wasFixed = true;
    // STOP HERE — don't run name-mismatch scan on already-cleaned text
    // as it will misidentify exposed words as names
    return { corrected: line, wasFixed, oldName };
  }

  const personaFirstWord = trimmedPersona.split(/\s+/)[0].toLowerCase();

  for (const pattern of INTRO_PATTERNS) {
    const match = line.match(pattern);
    if (match && match[1]) {
      const foundName = match[1];
      // Skip if it's a common non-name word
      if (SKIP_WORDS.has(foundName.toLowerCase())) continue;
      // Skip if it already matches the persona name (full or first word for multi-word names)
      if (foundName.toLowerCase() === trimmedPersona.toLowerCase()) continue;
      if (foundName.toLowerCase() === personaFirstWord) continue;
      // Skip if it's the placeholder already
      if (foundName === "{{agent_name}}") continue;

      line = line.replace(foundName, "{{agent_name}}");
      oldName = foundName;
      wasFixed = true;
      break;
    }
  }

  return { corrected: line, wasFixed, oldName };
}

/**
 * Runtime safety net: after {{agent_name}} has been resolved,
 * scan for any remaining name mismatch and replace with the actual persona name.
 */
export function runtimeGuardOpeningLine(resolvedLine: string, personaName: string): string {
  if (!resolvedLine || !personaName) return resolvedLine;

  const trimmedPersona = personaName.trim();
  if (!trimmedPersona) return resolvedLine;

  const personaFirstWord = trimmedPersona.split(/\s+/)[0].toLowerCase();

  for (const pattern of INTRO_PATTERNS) {
    const match = resolvedLine.match(pattern);
    if (match && match[1]) {
      const foundName = match[1];
      // Use the same SKIP_WORDS list as guardOpeningLine to avoid false positives
      if (SKIP_WORDS.has(foundName.toLowerCase())) continue;
      if (foundName.toLowerCase() === trimmedPersona.toLowerCase()) continue;
      if (foundName.toLowerCase() === personaFirstWord) continue;
      return resolvedLine.replace(foundName, trimmedPersona);
    }
  }

  return resolvedLine;
}
