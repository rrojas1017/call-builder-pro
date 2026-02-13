

## Update Agent Prompts with Current Special Enrollment Period (SEP) Rules

### Problem
The agent's ACA qualification logic is missing Special Enrollment Period (SEP) guidance entirely, and the user's test revealed the agent incorrectly suggested that low income alone (under 150% FPL) qualifies someone for a SEP. **This is outdated.** As of August 25, 2025, the low-income SEP was eliminated nationwide by both an HHS rule change and the "One Big Beautiful Bill Act" (OBBBA, enacted July 4, 2025). Income alone no longer triggers year-round enrollment eligibility.

### What Changed (Research Findings)
- The low-income SEP (available to people with income at or below 150% FPL) **was permanently eliminated** as of August 25, 2025.
- Enrollment outside of Open Enrollment now **requires a Qualifying Life Event (QLE)**.
- The 13 current qualifying life events include: loss of coverage, marriage, birth/adoption, permanent move, gaining citizenship, employer plan becoming unaffordable, and others.
- Open Enrollment for 2026 plans ran November 1 - December 15, 2025 (varies by state).
- Some states (DC, OR, MN, NY, MA, CT) have their own year-round programs for very low-income residents, but these are state-specific and separate from the federal marketplace SEP.

### Implementation

**1. Update `src/lib/fplThresholds.ts`**
   - Add a new exported function `buildSepSection()` that returns a prompt section with current SEP rules
   - Include the 13 qualifying life events (summarized concisely for the agent)
   - Explicitly state that low-income alone does NOT qualify for a SEP
   - Condition this section on the same `shouldIncludeFplTable()` health keyword check

**2. Update `src/lib/buildTaskPrompt.ts`**
   - Import and inject the SEP section into the prompt for health/ACA agents
   - Add SEP-aware qualification logic: if outside Open Enrollment, ask if the caller has experienced a qualifying life event
   - Add a new screening question for QLE detection (e.g., "Have you recently experienced any life changes such as losing coverage, getting married, having a baby, or moving to a new area?")
   - Update the qualification logic to reflect:
     - During Open Enrollment: standard FPL qualification applies
     - Outside Open Enrollment: caller must have a QLE to enroll, regardless of income

**3. Update `supabase/functions/tick-campaign/index.ts`**
   - Add the same SEP section and updated qualification logic to the edge function's `buildTaskPrompt`
   - Include the QLE screening question

**4. Update `supabase/functions/run-test-run/index.ts`**
   - Same changes as tick-campaign for consistency during test runs

### Prompt Content to Add

The SEP section will include:

```
SPECIAL ENROLLMENT PERIOD (SEP) RULES (Updated 2025):
IMPORTANT: The low-income SEP (income ≤150% FPL) was ELIMINATED as of August 25, 2025.
Income alone does NOT qualify someone for year-round enrollment.

Outside of Open Enrollment (Nov 1 - Dec 15), callers can ONLY enroll if they have
a Qualifying Life Event (QLE) within the past 60 days:
1. Involuntary loss of health coverage (job loss, aging off parent's plan, losing Medicaid)
2. Marriage
3. Birth, adoption, or placement of a child in foster care
4. Permanent move to a new coverage area (must have had prior coverage)
5. Becoming a U.S. citizen or gaining lawful presence
6. Divorce (if it results in loss of coverage)
7. Gaining access to a QSEHRA or Individual Coverage HRA from employer
8. Employer-sponsored plan becoming unaffordable (>9.96% of household income)
9. Change in income that affects subsidy eligibility
10. Leaving the Medicaid coverage gap due to income increase
11. Exceptional circumstances (natural disaster, enrollment errors)

If outside Open Enrollment:
- Ask if the caller has experienced any of these life events in the past 60 days
- If YES: they may qualify for a SEP regardless of income (still must meet FPL range)
- If NO: inform them they can enroll during the next Open Enrollment period
- Do NOT tell them they qualify for a SEP based on income alone
```

### Files to Modify
- `src/lib/fplThresholds.ts` -- add `buildSepSection()` function
- `src/lib/buildTaskPrompt.ts` -- add QLE question, inject SEP section, update qualification logic
- `supabase/functions/tick-campaign/index.ts` -- same prompt updates
- `supabase/functions/run-test-run/index.ts` -- same prompt updates

