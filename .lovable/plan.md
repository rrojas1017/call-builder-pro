

# AI-vs-AI Simulated Training

## Overview
Create a `simulate-call` edge function for AI-vs-AI conversations and update `auto-train` to support simulate/live/hybrid modes.

## Changes

### 1. Create `supabase/functions/simulate-call/index.ts`
New edge function that runs AI-vs-AI conversations:
- Loads the agent's real spec and knowledge, builds the actual agent prompt via `buildTaskPrompt`
- Generates a customer AI persona with difficulty levels (easy/medium/hard) and domain-specific data (health insurance, solar, debt, etc.)
- Runs multi-turn conversation (6-20 turns) using Gemini via the shared `ai-client.ts`
- Saves the transcript to `calls` table with `voice_provider: "simulated"`
- Triggers `evaluate-call` on the result — identical to real call evaluation

**Bug fix from provided code**: The user's code references `sb.from("projects")` — this table doesn't exist. Will use `agent_projects` instead.

### 2. Replace `supabase/functions/auto-train/index.ts`
Full rewrite to support 3 modes:
- **"simulate"** (default): Calls `simulate-call` for each round — no phone numbers needed
- **"live"**: Real phone calls via Retell test runs (current behavior, requires contacts)
- **"hybrid"**: Starts with simulation, graduates to live when score ≥ threshold (default 7.0)

Keeps existing: auth checks, regression rollback, score snapshots, early exit at 9.0+, fix deduplication.

### 3. Update `supabase/config.toml`
Add `[functions.simulate-call]` with `verify_jwt = false`.

## Files
- `supabase/functions/simulate-call/index.ts` — **New**
- `supabase/functions/auto-train/index.ts` — **Replace**
- `supabase/config.toml` — Add simulate-call entry

