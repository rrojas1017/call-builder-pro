
## Add 2025 Federal Poverty Level (FPL) Guidelines to Agent Prompt

### Current State
The agent prompts in `src/lib/buildTaskPrompt.ts` and `supabase/functions/` currently instruct the AI to qualify callers if their "income is within 100-400% of Federal Poverty Level," but there's no reference data. The AI relies on its training knowledge, which may be inaccurate or outdated.

### Goal
Embed 2025 Federal Poverty Level guidelines directly into the agent task prompt so the AI has explicit thresholds to calculate whether a caller's income qualifies based on their household size.

### Implementation Plan

**1. Create a new utility file: `src/lib/fplThresholds.ts`**
   - Define a constant `FPL_2025_THRESHOLDS` object with 2025 federal poverty levels for household sizes 1-8+ 
   - Include the actual HHS-issued poverty guidelines (e.g., 1 person: $14,580, 2 people: $19,720, etc.)
   - Add a helper function `getFplRange(householdSize: number, percentageRange: [number, number])` that calculates the income range (100-400% FPL) for a given household size
   - Export both for use in multiple places

**2. Update `src/lib/buildTaskPrompt.ts`**
   - Import FPL thresholds
   - Add a new section to the prompt called `FEDERAL POVERTY LEVEL THRESHOLDS` that displays a clear table of:
     - Household size → 100% FPL amount → 400% FPL amount (the qualification range)
   - Modify the QUALIFICATION LOGIC section to reference this table explicitly:
     - "Use the table below to determine if their income falls within the 100-400% FPL range based on their household size."

**3. Update `supabase/functions/tick-campaign/index.ts`**
   - Import the FPL utility or embed the thresholds directly
   - Add the FPL table to the task prompt generation (same format as buildTaskPrompt)

**4. Update `supabase/functions/run-test-run/index.ts`**
   - Import the FPL utility or embed the thresholds directly  
   - Add the FPL table to the task prompt generation in the `buildTaskPrompt` function

### FPL Data (2025 HHS Guidelines)
The 2025 federal poverty line thresholds per household size:
- 1 person: $14,580
- 2 people: $19,720
- 3 people: $24,860
- 4 people: $30,000
- 5 people: $35,140
- 6 people: $40,280
- 7 people: $45,420
- 8+ people: $50,560 (plus $5,140 per additional person)

### Prompt Section Example
```
FEDERAL POVERTY LEVEL THRESHOLDS (2025):
Qualification Range: 100-400% of Federal Poverty Level

Household Size | 100% FPL  | 400% FPL
1              | $14,580   | $58,320
2              | $19,720   | $78,880
3              | $24,860   | $99,440
4              | $30,000   | $120,000
5              | $35,140   | $140,560
6              | $40,280   | $161,120
7              | $45,420   | $181,680
8+             | $50,560+  | $202,240+
(Add $5,140 per additional person for 100% FPL; multiply by 4 for 400% FPL)

Use this table to determine qualification: If the caller's annual household income falls between the 100% and 400% FPL amounts for their household size, they may qualify for ACA marketplace assistance.
```

### Files to Create/Modify
- **Create**: `src/lib/fplThresholds.ts` (utility with FPL data and helper functions)
- **Modify**: `src/lib/buildTaskPrompt.ts` (add FPL section to prompt)
- **Modify**: `supabase/functions/tick-campaign/index.ts` (add FPL section to prompt)
- **Modify**: `supabase/functions/run-test-run/index.ts` (add FPL section to prompt)

### Benefits
- ✅ AI agent has explicit, accurate qualification thresholds
- ✅ Consistent FPL calculations across all prompt generation
- ✅ Easy to update annually when new HHS guidelines are released
- ✅ Reduces reliance on AI's internal training knowledge
- ✅ Improves compliance accuracy for ACA pre-qualification screening
