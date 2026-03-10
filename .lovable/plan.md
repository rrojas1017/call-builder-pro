

# Fix Premature Simulation End — End-Signal Detection Too Aggressive

## Problem
The live practice simulation (LiveSimulationChat) stopped after only 9 messages because the end-signal regex matches phrases that aren't actual goodbyes. For example, during a transfer handoff the agent might say "you're going to have a great experience" or "have a good one" — which triggers the end check at line 239 and kills the conversation prematurely.

The regex `/\b(goodbye|bye|have a (great|good)|thank you for your time|take care)\b/i` is too broad. "Have a good" matches mid-sentence phrases like "have a good chance" or "have a good plan."

## Fix

### 1. Tighten end-signal detection in `LiveSimulationChat.tsx`
- Replace the broad regex with more specific end-of-conversation patterns
- Only trigger end if the goodbye phrase appears near the **end** of the message (last 80 chars), not mid-sentence
- Add a minimum turn threshold — don't allow end signals until at least turn 4 (8+ messages), since real calls don't end after 2 exchanges
- Customer end signals: keep as-is but add minimum turn check
- Agent end signals: require the phrase to be in the final sentence of the response

### 2. Also fix `simulate-call` edge function (same issue)
- Apply the same tightened regex logic to the batch `runConversation` function in `supabase/functions/simulate-call/index.ts`
- Add minimum turn threshold there too

### 3. Fix the hardcoded 2-minute duration (bonus, from earlier discussion)
- Change `started_at: new Date(Date.now() - 120_000)` to use the actual calculated `duration_seconds`

### Files Changed
| File | Change |
|------|--------|
| `src/components/LiveSimulationChat.tsx` | Tighten end-signal regex, add min-turn threshold, check phrase position |
| `supabase/functions/simulate-call/index.ts` | Same end-signal fix + fix hardcoded 2-min duration |

