/**
 * 2026 Federal Poverty Level (FPL) Guidelines
 * Source: U.S. Department of Health & Human Services (HHS)
 * Used for ACA marketplace qualification screening.
 */

export const FPL_2026_BASE = 15060;
export const FPL_2026_PER_ADDITIONAL = 5380;

export const FPL_2026_THRESHOLDS: Record<number, number> = {
  1: 15060,
  2: 20440,
  3: 25820,
  4: 31200,
  5: 36580,
  6: 41960,
  7: 47340,
  8: 52720,
};

// Keep legacy exports for backward compat
export const FPL_2025_BASE = FPL_2026_BASE;
export const FPL_2025_PER_ADDITIONAL = FPL_2026_PER_ADDITIONAL;
export const FPL_2025_THRESHOLDS = FPL_2026_THRESHOLDS;

export function getFplForHouseholdSize(size: number): number {
  if (size <= 0) return FPL_2026_THRESHOLDS[1];
  if (size <= 8) return FPL_2026_THRESHOLDS[size];
  return FPL_2026_THRESHOLDS[8] + (size - 8) * FPL_2026_PER_ADDITIONAL;
}

export function getFplRange(householdSize: number, percentageRange: [number, number]): [number, number] {
  const base = getFplForHouseholdSize(householdSize);
  return [
    Math.round(base * (percentageRange[0] / 100)),
    Math.round(base * (percentageRange[1] / 100)),
  ];
}

const HEALTH_KEYWORDS = ['aca', 'health', 'insurance', 'medicaid', 'medicare', 'wellness', 'telehealth', 'benefits_enrollment'];

export function shouldIncludeFplTable(useCase: string | null | undefined): boolean {
  if (!useCase) return false;
  const lower = useCase.toLowerCase();
  return HEALTH_KEYWORDS.some(keyword => lower.includes(keyword));
}

export function buildFplTableSection(): string {
  return `FEDERAL POVERTY LEVEL THRESHOLDS (2026):
Qualification Range: 100-400% of Federal Poverty Level

Household Size | 100% FPL  | 400% FPL
1              | $15,060   | $60,240
2              | $20,440   | $81,760
3              | $25,820   | $103,280
4              | $31,200   | $124,800
5              | $36,580   | $146,320
6              | $41,960   | $167,840
7              | $47,340   | $189,360
8+             | $52,720+  | $210,880+
(Add $5,380 per additional person beyond 8 for 100% FPL; multiply by 4 for 400% FPL)

Use this table to determine qualification: If the caller's annual household income falls between the 100% and 400% FPL amounts for their household size, they may qualify for ACA marketplace assistance.`;
}

export function buildSepSection(): string {
  return `SPECIAL ENROLLMENT PERIOD (SEP) RULES (Updated 2025):
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
- Do NOT tell them they qualify for a SEP based on income alone`;
}
