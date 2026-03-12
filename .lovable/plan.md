
What happened
- I traced your live config and found the issue: your agent’s `business_rules` is currently stored as a plain text string (`"That's noted. / I've got that."`) instead of a structured rules object.
- The prompt builder only injects business rules when `business_rules` is an object, so your FPL rule is being silently dropped from the generated prompt.
- Because of that, the call logic falls back to the built-in generic FPL block (still labeled 2025), so your custom 2026 “positive response by FPL %” behavior is not being followed.

Implementation plan
1. Normalize and recover business rules data
- Add a one-time backend data migration to convert any string-based `business_rules` into object form (`{ rules: [...] }`) so rules are no longer ignored.
- For your current agent, append your exact “FPL Response Rule” text into `business_rules.rules` if it’s missing.

2. Harden rule-writing flows so this cannot regress
- Update `supabase/functions/apply-audit-recommendation/index.ts` so `business_rules` is always merged as an object (never overwritten as plain string).
- Keep behavior aligned with `apply-improvement` merge strategy for `business_rules.rules`.
- Update `src/lib/addBusinessRule.ts` to safely handle legacy string values (avoid string-spread corruption).

3. Harden prompt generation (both copies)
- Update:
  - `supabase/functions/_shared/buildTaskPrompt.ts`
  - `src/lib/buildTaskPrompt.ts`
- Make business rule extraction accept all shapes (`{rules}`, `{text}`, string, array-like fallback) and always serialize into the final “BUSINESS RULES (HIGHEST PRIORITY)” block.

4. Add explicit 2026 FPL response logic
- Update FPL guidance text to 2026 references and include explicit execution steps:
  - run after household size + annual income
  - compute estimated FPL %
  - respond positively for 100–400% with tiered phrasing examples (e.g., ~125% vs ~300%)
- Keep current non-eligible behavior outside range intact.

5. Validate end-to-end
- Verify generated prompt contains your exact FPL rule text.
- Run a simulated turn init to confirm the rule appears in `agent_system`.
- Run a full University test call and confirm transcript shows the FPL % acknowledgment and positive subsidy framing.

Technical details
- Root-cause files:
  - `supabase/functions/_shared/buildTaskPrompt.ts` (runtime prompt path)
  - `src/lib/buildTaskPrompt.ts` (UI mirror)
- Corruption source to harden:
  - `supabase/functions/apply-audit-recommendation/index.ts` (`business_rules` JSON handling)
  - `src/lib/addBusinessRule.ts` (legacy string safety)
- Data repair:
  - one migration to normalize existing `agent_specs.business_rules` JSON shape and preserve legacy text as rule content.
