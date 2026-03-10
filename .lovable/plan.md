

# Randomize Customer Personas for Each Simulation

## Problem
Every simulation uses the same customer: **"Maria Garcia"**. The name is hardcoded as the default in both `simulate-turn` and `simulate-call` edge functions. This means the agent only ever practices against one persona profile, reducing training diversity and usefulness.

## Fix
Randomize the customer name (and therefore their generated demographic data) on each simulation init, in both edge functions and the client.

### `supabase/functions/simulate-turn/index.ts`
- In `handleInit`, pick a random name from the existing names pool instead of defaulting to `"Maria Garcia"` when no `customer_name` is provided
- The `generateCustomerData` function already randomizes age/state/income — this just wasn't being used because the name was fixed

### `supabase/functions/simulate-call/index.ts`
- Same fix: pick a random name from the names pool instead of hardcoding `"Maria Garcia"`
- The `generateCustomerData` function here already has a full names array — just use it for the caller name too

### `src/components/SimulationTraining.tsx`
- No changes needed — it doesn't pass `customer_name`, so the randomization in the edge functions handles it

### `src/components/LiveSimulationChat.tsx`
- No changes needed — same reason, it relies on the edge function default

## Scope
Two edge function files, minimal changes (replace hardcoded default with random pick from existing array).

