
## Add Agent Type Icon (Outbound/Inbound) to Agent Cards

### Current State
- The `agent_specs` table already has a `mode` column that stores "outbound", "inbound", or "hybrid"
- The `generate-spec` edge function already determines the agent mode during creation
- The `AgentsPage.tsx` currently queries only `agent_projects` and doesn't fetch the agent's mode
- Agent cards display a generic `Bot` icon with no type differentiation

### Solution
Add a visual indicator to agent cards showing whether the agent is Outbound, Inbound, or Hybrid by:

1. **Update Agent Query** (`src/pages/AgentsPage.tsx`)
   - Modify the database query to join with `agent_specs` to fetch the `mode` field
   - Update the `Agent` interface to include `mode: "outbound" | "inbound" | "hybrid"`
   - Fetch mode for all agents in a single efficient query

2. **Update Agent Card Display** (`src/pages/AgentsPage.tsx`)
   - Replace the generic `Bot` icon with a mode-specific icon:
     - **Outbound**: `Phone` icon (agent calls out) - primary color
     - **Inbound**: `PhoneIncoming` icon (receives calls) - secondary color
     - **Hybrid**: `Phone` with badge or `PhoneForwarded` - accent color
   - Add a small badge/label below the agent name (e.g., "Outbound", "Inbound") or directly in the icon tooltip
   - Keep the existing card layout intact

3. **Visual Design**
   - Use `lucide-react` icons: `Phone` (outbound), `PhoneIncoming` (inbound), `PhoneForwarded` (hybrid)
   - Color code each mode for quick visual scanning
   - Add subtle tooltip on hover to confirm the agent type (optional but nice UX)

### Files to Modify
- `src/pages/AgentsPage.tsx` -- Update query, interface, and card rendering logic

### What Users Will See
- Agent cards now show:
  - Outbound agent: `📞 Phone` icon in primary color + "Outbound" label/badge
  - Inbound agent: `📥 PhoneIncoming` icon in secondary color + "Inbound" label/badge
  - Hybrid agent: `🔄 PhoneForwarded` icon in accent color + "Hybrid" label/badge
- Helps users at a glance distinguish between different agent types without clicking into details

### No Breaking Changes
- Existing functionality (edit, test, knowledge links) remains unchanged
- All agents that were previously created default to "outbound" in the database
- The addition is purely visual and informational
