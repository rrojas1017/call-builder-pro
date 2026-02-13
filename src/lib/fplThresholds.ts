/**
 * 2025 Federal Poverty Level (FPL) Guidelines
 * Source: U.S. Department of Health & Human Services (HHS)
 * Used for ACA marketplace qualification screening.
 */

export const FPL_2025_BASE = 14580;
export const FPL_2025_PER_ADDITIONAL = 5140;

export const FPL_2025_THRESHOLDS: Record<number, number> = {
  1: 14580,
  2: 19720,
  3: 24860,
  4: 30000,
  5: 35140,
  6: 40280,
  7: 45420,
  8: 50560,
};

export function getFplForHouseholdSize(size: number): number {
  if (size <= 0) return FPL_2025_THRESHOLDS[1];
  if (size <= 8) return FPL_2025_THRESHOLDS[size];
  return FPL_2025_THRESHOLDS[8] + (size - 8) * FPL_2025_PER_ADDITIONAL;
}

export function getFplRange(householdSize: number, percentageRange: [number, number]): [number, number] {
  const base = getFplForHouseholdSize(householdSize);
  return [
    Math.round(base * (percentageRange[0] / 100)),
    Math.round(base * (percentageRange[1] / 100)),
  ];
}

export function buildFplTableSection(): string {
  return `FEDERAL POVERTY LEVEL THRESHOLDS (2025):
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
(Add $5,140 per additional person beyond 8 for 100% FPL; multiply by 4 for 400% FPL)

Use this table to determine qualification: If the caller's annual household income falls between the 100% and 400% FPL amounts for their household size, they may qualify for ACA marketplace assistance.`;
}
