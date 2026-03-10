

# Unified Training History

## What It Does
Merges all training call types into a single historical section on the University page. Currently, only phone-based test calls (`test_run_contacts`) appear in the history table. After this change, simulated calls (from both batch Training rounds and Live Practice "Save & Learn") stored in the `calls` table with `voice_provider = 'simulated'` will also appear — giving users a single place to review all training activity and provide feedback.

## How It Works

### Data Sources
1. **Phone test calls** — `test_run_contacts` table (existing, already shown)
2. **Simulated calls** — `calls` table where `voice_provider = 'simulated'` (from `simulate-call` edge function and `LiveSimulationChat` Save & Learn). These already have `evaluation`, `transcript`, `outcome`, `duration_seconds`, etc.

### Changes to `src/pages/UniversityPage.tsx`

**1. Unified history loader (`loadHistory`)**
- Keep the existing `test_run_contacts` query
- Add a second query to `calls` table filtered by `project_id = agentId` and `voice_provider = 'simulated'`, with evaluation not null, limited to 20, ordered by `created_at desc`
- Map `calls` rows to the same `TestContact` shape, adding a `source: "simulation" | "test_call"` discriminator
- Merge both arrays, sort by `created_at desc`, take top 20

**2. History table UI update**
- Add a "Type" column showing a badge: "Phone Test" or "Simulation"
- The existing click-to-view behavior works for both types since `ResultCard` uses the same `TestContact` shape
- For simulation calls, the feedback save path will write to `calls.evaluation` instead of `test_run_contacts.user_feedback` — add a conditional in `handleSaveFeedback` based on the source field

**3. Update `TestContact` interface**
- Add optional `source?: "test_call" | "simulation"` field
- Add optional `call_id?: string` for simulation calls (the `calls.id`)

**4. Feedback handling for simulation history**
- When viewing a simulation call from history, the feedback save writes to the `calls` table instead of `test_run_contacts`
- The "Apply Fix" flow works identically since it only needs `projectId`

**5. Trend data**
- Also query simulated calls from `calls` table and merge into trend chart data

**6. Stats computation**
- Include simulated call scores in the graduation level calculation

### Files Changed
| File | Change |
|------|--------|
| `src/pages/UniversityPage.tsx` | Merge `calls` (simulated) into history, trend, and stats; add Type column; handle feedback for both sources |

No database or backend changes needed — the `calls` table already contains all the data with proper RLS policies.

