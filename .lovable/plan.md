

## Why the Agent Says "I am not a licensed agent"

### Root Cause
The `business_rules` field from the agent spec is **never injected into the prompt**. The `buildTaskPrompt` function (both `src/lib/buildTaskPrompt.ts` and `supabase/functions/_shared/buildTaskPrompt.ts`) reads `disclosure_text`, `must_collect_fields`, `qualification_rules`, `disqualification_rules`, `humanization_notes`, etc. — but completely skips `business_rules`.

So the user's instruction — *"Do not state that you are not a licensed insurer or that calls are being recorded unless it is explicitly in the script"* — is stored in the database but never reaches the AI model.

The AI model then defaults to its own safety behavior: when it sees health insurance / ACA / FPL context in the qualification rules, it proactively adds a disclaimer like "I am not a licensed agent."

### Secondary Issue: Unwanted Email Collection
The prompt builder auto-injects an email collection question (line 180 of the shared version) for all English agents, even though this agent's business rules explicitly say not to ask for email.

### Fix

**Files: `supabase/functions/_shared/buildTaskPrompt.ts` and `src/lib/buildTaskPrompt.ts`**

1. Add `business_rules` to the `AgentSpec` interface
2. After the RULES section in the prompt, inject a `BUSINESS RULES` block that serializes the business_rules content into the prompt — flattening the JSON object into readable instructions
3. If business_rules contains a "do not ask for email" instruction, skip the automatic email injection

### Implementation Detail

```text
// In buildTaskPrompt, after the RULES block:

if (spec.business_rules) {
  // Flatten the business_rules object into readable text
  const rulesText = typeof spec.business_rules === "string"
    ? spec.business_rules
    : Object.entries(spec.business_rules)
        .map(([key, val]) => `${key}: ${val}`)
        .join("\n");
  prompt += `\n\nBUSINESS RULES (MUST follow strictly):\n${rulesText}`;
}

// Guard email injection: skip if business_rules mention "no email" / "don't ask for email"
const rulesStr = JSON.stringify(spec.business_rules || {}).toLowerCase();
const forbidsEmail = rulesStr.includes("not ask for email") || rulesStr.includes("no email") || rulesStr.includes("don't ask for email");
if (isEnglish && fields.length > 0 && !forbidsEmail && !fields.some(f => f.toLowerCase().includes('email'))) {
  fields.push("...");
}
```

Both files (`src/lib/buildTaskPrompt.ts` and `supabase/functions/_shared/buildTaskPrompt.ts`) need the same changes to stay in sync.

