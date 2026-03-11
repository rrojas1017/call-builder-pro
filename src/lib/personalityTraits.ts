export interface PersonalityTrait {
  label: string;
  directive: string;
}

export const PRESET_TRAITS: PersonalityTrait[] = [
  { label: "Empathetic", directive: "Be empathetic — acknowledge the caller's feelings and validate concerns before continuing." },
  { label: "Assertive", directive: "Be confidently assertive — guide the conversation with clear direction and keep things on track." },
  { label: "Patient", directive: "Be patient — never rush the caller, allow pauses, and repeat information if needed." },
  { label: "Humorous", directive: "Use light, appropriate humor to build rapport — but never at the caller's expense." },
  { label: "Warm", directive: "Be genuinely warm — make the caller feel valued and comfortable from the first moment." },
  { label: "Direct", directive: "Be direct and concise — get to the point without unnecessary filler or small talk." },
  { label: "Enthusiastic", directive: "Show genuine enthusiasm about helping the caller — let positive energy come through naturally." },
  { label: "Calm", directive: "Maintain a calm, steady presence — even if the caller is frustrated or anxious, stay composed." },
  { label: "Persuasive", directive: "Be naturally persuasive — highlight benefits and create urgency without being pushy." },
  { label: "Casual", directive: "Keep the tone casual and relaxed — talk like a friendly neighbor, not a corporate robot." },
  { label: "Formal", directive: "Maintain a professional, formal tone — be respectful and polished throughout." },
  { label: "Energetic", directive: "Bring high energy to the conversation — be upbeat and keep the momentum going." },
];

/** Convert a directive string back to a trait label, or null if it's a custom trait */
export function directiveToLabel(directive: string): string | null {
  const match = PRESET_TRAITS.find(t => t.directive === directive);
  return match?.label ?? null;
}

/** Convert a trait label to its directive */
export function labelToDirective(label: string): string {
  const match = PRESET_TRAITS.find(t => t.label === label);
  return match?.directive ?? label;
}

/** Parse humanization_notes into selected preset labels and custom directives */
export function parseHumanizationNotes(notes: string[]): { selectedLabels: string[]; customDirectives: string[] } {
  const selectedLabels: string[] = [];
  const customDirectives: string[] = [];
  for (const note of notes) {
    const label = directiveToLabel(note);
    if (label) {
      selectedLabels.push(label);
    } else {
      customDirectives.push(note);
    }
  }
  return { selectedLabels, customDirectives };
}

/** Combine selected trait labels and custom directives into humanization_notes array */
export function buildHumanizationNotes(selectedLabels: string[], customDirectives: string[]): string[] {
  const directives = selectedLabels.map(labelToDirective);
  return [...directives, ...customDirectives.filter(d => d.trim())];
}
