

# Add Live Simulation Chat to University Page

## Overview
Add a turn-by-turn live chat view where users watch their agent practice against an AI customer in real-time, with typing indicators and a chat-style UI.

## Changes

### 1. New Edge Function: `supabase/functions/simulate-turn/index.ts`
Handles one conversation turn at a time (two actions: `init` and `turn`). Uses `buildTaskPrompt` and `resolveBeginMessage` from shared module. `init` loads agent spec + knowledge, builds system prompts for both agent and customer, returns opening line. `turn` takes role + history, calls AI for one reply.

Note: `resolveBeginMessage` is already exported from `_shared/buildTaskPrompt.ts` — confirmed in codebase.

### 2. New Component: `src/components/LiveSimulationChat.tsx`
Chat-style interface showing agent/customer messages appearing one-by-one with typing indicators (bouncing dots). Includes difficulty selector, start/stop/restart controls, turn counter, auto-scroll. Uses refs for stop control to safely cancel mid-conversation.

### 3. Update `src/pages/UniversityPage.tsx`
- Add import for `LiveSimulationChat`
- Render `<LiveSimulationChat projectId={agentId} />` after the `SimulationTraining` block (after line 600), gated on `agentId`

### 4. Config
Add JWT bypass in `supabase/config.toml` for the new function:
```toml
[functions.simulate-turn]
verify_jwt = false
```

## Files
- `supabase/functions/simulate-turn/index.ts` — **New**
- `src/components/LiveSimulationChat.tsx` — **New**
- `src/pages/UniversityPage.tsx` — Add import + render
- `supabase/config.toml` — Add function config

