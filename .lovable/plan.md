

# Fix ACA Agent: Email Capture and Rushed Pacing

## Problems Identified

1. **Email capture feels forced**: The auto-injected email question ("What's the best email address to reach you at?") is inserted at `fields.length - 1` -- right before the last field. For ACA agents, this puts it awkwardly between consent/qualification questions and the transfer step, making it feel abrupt and out of place.

2. **Agent sounds rushed / in a hurry**: The RULES section tells the agent to "acknowledge each answer before the next question" but lacks explicit pacing instructions. There is no guidance to pause between topics, take a breath, or slow down when transitioning between screening questions. The long list of COLLECT fields (10+ for ACA agents) combined with the health qualification rules creates pressure to rapid-fire through questions.

## Solution

### 1. Improve email placement and framing for ACA/health agents
**File:** `supabase/functions/_shared/buildTaskPrompt.ts`

Move email collection to the very end of the COLLECT list (after all qualification fields, right before transfer) instead of `fields.length - 1`. Also soften the framing to feel like a natural wind-down rather than another screening question.

Change the email injection from:
```
const insertAt = Math.max(fields.length - 1, 0);
fields.splice(insertAt, 0, "What's the best email...");
```
To:
```
fields.push("Before I connect you, what's the best email to send your plan details to?");
```

### 2. Add explicit pacing rules to the prompt
**File:** `supabase/functions/_shared/buildTaskPrompt.ts`

Add pacing instructions to the RULES section:
- Do NOT rapid-fire questions. After the caller answers, respond with a brief acknowledgment or comment before asking the next question.
- Take a conversational breath between topic changes (e.g., moving from personal info to income questions).
- If the caller gives a short answer, add a human reaction ("Got it", "Perfect, thanks") before continuing.

### 3. Mirror changes in frontend copy
**File:** `src/lib/buildTaskPrompt.ts`

Apply the same two changes (email placement + pacing rules) to keep the client-side preview in sync.

## Technical Details

**Email injection fix** (both files):
```typescript
// Before (inserts awkwardly near-end)
const insertAt = Math.max(fields.length - 1, 0);
fields.splice(insertAt, 0, "What's the best email...");

// After (appends at end with softer framing)
fields.push("Before I connect you, what's the best email address to send your plan details and next steps to?");
```

**Pacing rules addition** (both files, in the RULES block around line 192-199):
```
- PACING: Do NOT rapid-fire through questions. After each answer, pause and acknowledge naturally ("Got it", "That helps", "Okay, great") before moving to the next question. When shifting topics (e.g., from personal info to income), use a brief transition like "Alright, just a couple more things..." to signal the change.
- If the caller gives a detailed answer or shares something personal, react to it briefly before continuing — do not immediately jump to the next field.
```

No database changes. No new files. Just prompt tuning in two existing files.

