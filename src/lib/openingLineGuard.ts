/**
 * Detects hardcoded names in opening lines that don't match the persona name,
 * and replaces them with the {{agent_name}} placeholder.
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

export function guardOpeningLine(openingLine: string, personaName: string): GuardResult {
  if (!openingLine || !personaName) {
    return { corrected: openingLine, wasFixed: false };
  }

  const trimmedPersona = personaName.trim();
  if (!trimmedPersona) {
    return { corrected: openingLine, wasFixed: false };
  }

  const personaFirstWord = trimmedPersona.split(/\s+/)[0].toLowerCase();

  for (const pattern of INTRO_PATTERNS) {
    const match = openingLine.match(pattern);
    if (match && match[1]) {
      const foundName = match[1];
      // Skip if it already matches the persona name (full or first word for multi-word names)
      if (foundName.toLowerCase() === trimmedPersona.toLowerCase()) continue;
      if (foundName.toLowerCase() === personaFirstWord) continue;
      // Skip if it's the placeholder already
      if (foundName === "{{agent_name}}") continue;

      const corrected = openingLine.replace(foundName, "{{agent_name}}");
      return { corrected, wasFixed: true, oldName: foundName };
    }
  }

  return { corrected: openingLine, wasFixed: false };
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
      if (foundName.toLowerCase() === trimmedPersona.toLowerCase()) continue;
      // If the found name matches the first word of the persona, it's already correct
      if (foundName.toLowerCase() === personaFirstWord) continue;
      return resolvedLine.replace(foundName, trimmedPersona);
    }
  }

  return resolvedLine;
}
