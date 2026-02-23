

# Bulk Fix: Remove Transfer Agent Flag from All Retell Agents

## Problem
Several agents in the Retell dashboard are categorized under "Transfer Screening Agents." This prevents them from making outbound calls. None of your agents should be transfer agents.

## Root Cause
When agents are created with a `transfer_call` tool in their LLM config, Retell automatically flags the LLM as a "transfer LLM" and the agent as a "transfer agent." The current creation flow in `bulk-sync-retell-agents` and `manage-retell-agent` does not explicitly set `is_transfer_agent: false` during creation.

## Plan

### 1. Create a new backend function: `bulk-fix-transfer-agents`
This function will:
- Query all `agent_specs` rows that have a `retell_agent_id`
- For each agent, call Retell API to:
  - GET the agent to find its `llm_id`
  - PATCH the LLM with `{ is_transfer_llm: false }`
  - PATCH the agent with `{ is_transfer_agent: false }`
- Return a summary of how many were fixed

### 2. Update existing agent creation to prevent this in the future
Modify `manage-retell-agent` (create action) and `bulk-sync-retell-agents` to explicitly include `is_transfer_agent: false` in the agent creation body, ensuring new agents never get flagged as transfer agents.

### 3. Add a "Fix All Transfer Agents" button on the Agents page
Add a button (visible when needed) that calls the new bulk-fix function, similar to the existing "Sync All Now" button.

## Technical Details

### New Edge Function: `bulk-fix-transfer-agents`
- Reads all `retell_agent_id` values from `agent_specs`
- Iterates through each, calling Retell GET + two PATCHes
- Returns count of fixed agents

### Changes to `manage-retell-agent/index.ts`
- Add `is_transfer_agent: false` to the `buildAgentBody` function (line ~23)

### Changes to `bulk-sync-retell-agents/index.ts`
- Add `is_transfer_agent: false` to the `createBody` object (line ~96)

### Changes to `AgentsPage.tsx`
- Add a button to trigger the bulk fix (reuses the existing sync banner pattern)

