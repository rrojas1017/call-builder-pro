

## Move Pipeline Audit from MONITOR to SYSTEM

### Change

Move `{ label: "Pipeline Audit", path: "/training-audit" }` from the MONITOR section to the SYSTEM section in the default sidebar configuration.

### Files

| File | Change |
|------|--------|
| `src/hooks/useSidebarConfig.ts` | Remove Pipeline Audit from MONITOR items array, add it to SYSTEM items array (after Billing) |
| Database update | Update the existing `sidebar_config` row to move the item between sections, ensuring the DB config matches the new defaults |

### Result

MONITOR will contain: Calls, University
SYSTEM will contain: Settings, Team, Billing, Pipeline Audit

