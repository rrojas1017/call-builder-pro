

# Add Agent Profile Summary to Edit Agent Page

## What You'll Get
A visual profile card at the top of the Edit Agent page that shows the current configuration of the agent at a glance -- including the voice being used, persona name, mode, maturity level, ambient sound, and key stats like call count and average score. This way you can immediately see "who" the agent is before diving into edits.

## Changes

### 1. Fetch additional profile data on load
The Edit Agent page already loads `agent_projects` and `agent_specs`. We'll also fetch:
- The voice name (resolved from the voice list by matching `voice_id`)
- The maturity level from `agent_projects`
- Call count and qualified count from `calls`
- Average evaluation score from `calls`

### 2. Add a Profile Summary card at the top
Right below the page header (and above the Identity section), we'll add a compact card showing:

| Field | Source |
|-------|--------|
| Persona Name | `agent_specs.persona_name` |
| Voice | Resolved name from Retell voices list |
| Mode | `agent_specs.mode` (Outbound/Inbound) |
| Maturity Level | `agent_projects.maturity_level` with color badge |
| Ambient Sound | `agent_specs.background_track` |
| Opening Line | `agent_specs.opening_line` (truncated) |
| Tone | `agent_specs.tone_style` |
| Transfer | Enabled/Disabled + phone number |
| Retell Agent ID | Shown if provisioned |
| Total Calls / Qualified / Avg Score | Aggregated from `calls` table |

This will be a read-only summary section styled as a "resume card" -- consistent with the existing `AgentProfileCard` pattern but expanded with more detail since this is the dedicated edit page.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Add maturity level to the data load query. Add a profile summary card section between the header and the Identity form section. Resolve voice name from the loaded voices list. Fetch call stats (total, qualified, avg score). |

