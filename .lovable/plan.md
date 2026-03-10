

# Add Customer Interruptions to Live Simulations

## Problem
Currently, the simulation is perfectly turn-based — agent speaks, customer speaks, agent speaks. Real phone conversations have interruptions, talking over each other, and cut-off sentences. The customer AI never interrupts.

## Approach

Two changes needed:

### 1. Customer system prompt — instruct interruptions (`simulate-turn/index.ts`)

Update `buildCustomerPrompt` to add interruption behavior rules, scaled by difficulty:

- **Easy**: Rarely interrupts (maybe once)
- **Medium**: Occasionally interrupts mid-sentence — "wait, hold on—", "sorry but—", cuts agent off to ask a question
- **Hard**: Frequently interrupts, talks over agent, cuts them off, says "yeah yeah I know" before agent finishes

Add to the RULES section:
```
- INTERRUPTIONS: Sometimes cut the agent off mid-thought. Start your reply with "—" or "wait—" or "hold on—" to signal you're interrupting. On [difficulty], do this [frequency].
- When you interrupt, you can: redirect the conversation, ask an unrelated question, express impatience, or jump ahead.
```

### 2. Frontend — simulate interruption mid-message (`LiveSimulationChat.tsx`)

Add a random chance (based on difficulty) that the customer "interrupts" the agent. When this triggers:

1. After the agent's turn starts, randomly decide to interrupt (easy: 10%, medium: 25%, hard: 40%)
2. If interrupting: truncate the agent's message at a natural breakpoint (sentence boundary or mid-sentence with "—") before displaying it
3. Immediately fire the customer turn with the truncated agent message in history
4. This creates the visual effect of the customer cutting the agent off

In the turn loop (lines 163-220), add interruption logic:
- After getting agent response, roll a random chance
- If interrupt triggers: slice agent content at ~40-70% length, append "—", display truncated version, then immediately proceed to customer turn with a flag in the history indicating the agent was cut off

### Files Changed
- `supabase/functions/simulate-turn/index.ts` — update `buildCustomerPrompt` with interruption instructions
- `src/components/LiveSimulationChat.tsx` — add interruption probability + truncation logic in the turn loop

