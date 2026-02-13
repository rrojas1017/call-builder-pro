
## Conditionally Apply FPL Guidelines Only to Health/ACA Agents

### Problem
The 2025 Federal Poverty Level (FPL) guidelines are currently being injected into **all agent prompts**, regardless of their use case. This is inappropriate for non-health-related agents (e.g., sales, lead generation, survey agents) that don't need FPL qualification logic.

### Solution
Conditionally include the FPL table only when the agent's `use_case` field indicates it's a health-related or ACA agent.

### Implementation

**1. Update `src/lib/fplThresholds.ts`**
   - Add a new helper function `shouldIncludeFplTable(useCase: string | null | undefined): boolean`
   - Return `true` only if `use_case` contains health-related keywords: 'aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness'
   - Export this function for use in prompt builders

**2. Update `src/lib/buildTaskPrompt.ts`**
   - Import the new `shouldIncludeFplTable` function
   - Update the `AgentSpec` interface to include the `use_case` field
   - Conditionally include the FPL table section only if `shouldIncludeFplTable(spec.use_case)` returns true
   - Non-ACA agents will skip the FPL section entirely

**3. Update `supabase/functions/run-test-run/index.ts`**
   - Update the `AgentSpec` interface to include `use_case` field
   - Import the FPL utility function
   - Conditionally include the FPL table in the `buildTaskPrompt` function only for health-related agents
   - This ensures test runs respect the agent's actual use case

**4. Update `supabase/functions/tick-campaign/index.ts`**
   - Add conditional logic in the `buildTaskPrompt` function to include FPL only if the spec's `use_case` is health-related
   - Retrieve the `use_case` from the agent spec when building the prompt

### Design Decision
- Define a whitelist of health-related keywords in the `shouldIncludeFplTable` function to keep logic maintainable
- This allows future use cases to be added without code changes (e.g., 'telehealth', 'benefits_enrollment')
- Non-matching agents simply get no FPL reference in their prompt

### Files to Modify
- **Modify**: `src/lib/fplThresholds.ts` (add `shouldIncludeFplTable` function)
- **Modify**: `src/lib/buildTaskPrompt.ts` (add `use_case` to interface, conditionally include FPL)
- **Modify**: `supabase/functions/run-test-run/index.ts` (add `use_case` to interface, conditional FPL)
- **Modify**: `supabase/functions/tick-campaign/index.ts` (conditional FPL in prompt builder)

### Benefits
- ✅ FPL guidelines only appear in health/ACA agent prompts
- ✅ Sales, lead gen, and other agents won't have irrelevant FPL qualification logic
- ✅ Easy to add new health-related use cases in the future
- ✅ Maintains consistency across test runs and live campaigns
