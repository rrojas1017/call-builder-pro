

# Fix: Backend buildTaskPrompt doesn't handle `{ rules: [] }` format

## Status of Both Problems

**Problem 1 - business_rules injection**: Both the client-side (`src/lib/buildTaskPrompt.ts`) and backend (`supabase/functions/_shared/buildTaskPrompt.ts`) DO inject `business_rules` into the prompt. The client-side version was already updated to handle the `{ rules: [] }` array format (lines 169-184). However, the **backend version has a bug**: it only handles string or generic object formats (lines 218-225). When the UI saves `{ rules: ["rule 1", "rule 2"] }`, the backend would render it as `- rules: rule1,rule2` -- a single flattened line instead of a numbered list. This means the FPL instructions would be mangled during live calls and simulations that use the backend prompt builder.

**Problem 2 - apply-audit-recommendation**: Confirmed risk. The AI mapper could misroute complex FPL rules. Recommendation stands: use the Business Rules UI directly, not the Coach feedback box.

## Change

### `supabase/functions/_shared/buildTaskPrompt.ts` (lines 217-225)

Update the business rules injection block to match the client-side logic that already handles `{ rules: [] }`, `{ text: "..." }`, raw string, and generic object formats:

```typescript
// Inject business rules as high-priority instructions
if (spec.business_rules && typeof spec.business_rules === "object" && Object.keys(spec.business_rules).length > 0) {
  const br = spec.business_rules as any;
  let brText: string;
  if (Array.isArray(br.rules)) {
    brText = br.rules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n");
  } else if (typeof br.text === "string") {
    brText = br.text;
  } else if (typeof spec.business_rules === "string") {
    brText = spec.business_rules;
  } else {
    brText = Object.entries(spec.business_rules)
      .map(([key, val]) => `- ${key}: ${val}`)
      .join("\n");
  }
  prompt += `\n\nBUSINESS RULES (MUST follow strictly — these override any default behavior):\n${brText}`;
}
```

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/_shared/buildTaskPrompt.ts` | Fix business_rules injection to handle `{ rules: [] }` array format |

One file, ~10 lines changed. After this fix, you can safely paste the FPL conditional logic into the Business Rules UI and it will be correctly injected as a numbered list into the agent's system prompt for both simulations and live calls.

