/**
 * Detects if transcribed feedback text contains intent to add a business rule.
 * Returns the extracted rule text if matched.
 */

const TRIGGER_PATTERNS = [
  /(?:add|save|make|set)\s+(?:this|the following|that)\s+as\s+a?\s*business\s+rule[:\s]*/i,
  /(?:add|save|make|set)\s+(?:this|the following|that)\s+as\s+a?\s*rule[:\s]*/i,
  /(?:add|save)\s+(?:this|the following)\s+(?:to|into)\s+(?:the\s+)?business\s+rules?[:\s]*/i,
  /(?:new|create)\s+business\s+rule[:\s]*/i,
  /business\s+rule[:\s]+/i,
];

export interface BusinessRuleDetection {
  isBusinessRule: boolean;
  ruleText: string;
}

export function detectBusinessRuleIntent(text: string): BusinessRuleDetection {
  if (!text?.trim()) return { isBusinessRule: false, ruleText: "" };

  for (const pattern of TRIGGER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const ruleText = text.slice(match.index! + match[0].length).trim();
      if (ruleText.length >= 5) {
        return { isBusinessRule: true, ruleText };
      }
    }
  }

  return { isBusinessRule: false, ruleText: "" };
}
