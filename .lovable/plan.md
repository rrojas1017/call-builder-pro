

# Add Business Rules Section to Edit Agent Page

## Problem
The `business_rules` field exists in the database and is already injected into the agent prompt as high-priority directives, but there's no UI to edit it. Users have no way to add detailed conditional logic like FPL response rules.

## Change

### `src/pages/EditAgentPage.tsx`
- Add state: `const [businessRules, setBusinessRules] = useState("")`
- Load from spec: parse `spec.business_rules` (it's a JSON object, extract a `text` or `rules` key, or stringify it)
- Save: serialize back into `business_rules` field in the spec update
- UI: Add a new section between "Qualification Rules" and "Compliance" with:
  - Title: "Business Rules" with a `BookOpen` or `ScrollText` icon
  - Helper text: "Define specific rules your agent must follow. These are treated as high-priority directives that override default behavior. Use plain language — e.g., conditional responses based on FPL percentage, Medicaid denial handling, etc."
  - A large `Textarea` (6-8 rows) for freeform input
  - A `SectionHelp` tooltip

### Files Changed
| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Add Business Rules textarea section + state + save logic |

One file, ~30 lines added. The backend already reads and injects `business_rules` into the prompt — no backend changes needed.

