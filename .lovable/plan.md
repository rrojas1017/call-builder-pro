
## Problem
Currently, the knowledge base is loaded raw (up to 10 entries) and injected directly into the task prompt. As agents learn and the knowledge base grows, the prompt approaches the 28,000-character limit even with compact formatting. This limits knowledge growth and forces truncation.

## Solution: Pre-Call AI Summarization

Implement a new edge function `summarize-agent-knowledge` that uses Lovable AI (Gemini Flash) to compress the entire knowledge base into a compact briefing (~500 chars) before each call, then inject that briefing into the task prompt instead of raw knowledge entries.

### Architecture

**Workflow:**
1. When `run-test-run` or `tick-campaign` initiates calls, before building the task prompt:
   - Fetch ALL knowledge entries (no limit)
   - Call new `summarize-agent-knowledge` edge function
   - Receive compressed briefing (~500 chars)
   - Inject briefing into task prompt
   - Proceed with call initiation as usual

**Benefits:**
- Unlimited knowledge base growth (10 → 1000 entries = same prompt size)
- ~500 chars per project (vs. 2,000-4,000 chars raw)
- Better knowledge relevance (AI picks key insights vs. dumping everything)
- Enables knowledge evolution without prompt bloat

### Files to Create/Modify

**1. Create: `supabase/functions/summarize-agent-knowledge/index.ts`**
   - Accept: `project_id` (string)
   - Fetch: All `agent_knowledge` entries for that project (no limit)
   - Call Lovable AI (Gemini Flash) with system prompt: "Compress this knowledge into a 500-char briefing"
   - Return: `{ briefing: string; entries_count: number }`
   - Handle errors: Return fallback briefing if AI fails

**2. Modify: `supabase/functions/run-test-run/index.ts`**
   - Remove raw knowledge fetching (lines 246-251)
   - Before building `baseTask` prompt:
     - Call `summarize-agent-knowledge` (via supabase.functions.invoke)
     - Inject returned briefing into the prompt as `KNOWLEDGE BRIEFING: {briefing}`
   - Keep existing `buildTaskPrompt` signature but modify to accept optional `knowledgeBriefing` parameter

**3. Modify: `supabase/functions/tick-campaign/index.ts`**
   - Same changes as run-test-run (no raw knowledge fetch, call summarization function)

**4. Modify: `src/lib/buildTaskPrompt.ts`**
   - Add optional `knowledgeBriefing` parameter
   - If provided, inject as: `\n\nKNOWLEDGE BRIEFING:\n${knowledgeBriefing}`
   - Keep FPL, humanization, and other sections as-is

**5. Update: `supabase/config.toml`**
   - Add `[functions.summarize-agent-knowledge]` with `verify_jwt = false`

### Implementation Details

**Edge Function: `summarize-agent-knowledge/index.ts`**
```
- Input: { project_id }
- Fetch: All rows from agent_knowledge table (no limit)
- Prepare text: Format as "Category: content. Category: content."
- Call Lovable AI:
  - Model: "google/gemini-3-flash-preview" (default, fast, cheap)
  - System: "Compress this agent knowledge into a single 500-character briefing. Include only the most critical business rules and insights. Return ONLY the briefing text."
  - User: "[Formatted knowledge entries]"
- Return: { briefing, entries_count, characters_reduced }
- Error handling: If AI fails, return fallback briefing + log warning
```

**Prompt Injection in Task Building:**
```
Current (lines 122-139 in run-test-run):
  "DOMAIN KNOWLEDGE:\n${knowledgeSection}"

New:
  if (knowledgeBriefing) {
    prompt += `\n\nKNOWLEDGE BRIEFING: ${knowledgeBriefing}`;
  }
```

### Character Impact

- **Before**: Knowledge = 2,000–4,000 chars (10 entries raw)
- **After**: Knowledge = ~500 chars (AI-compressed)
- **Savings**: ~1,500–3,500 chars per call
- **New total**: ~12,000–14,000 chars (vs. 28,000 limit)
- **Headroom**: Room for unlimited knowledge growth

### Edge Cases & Mitigations

| Case | Mitigation |
|------|-----------|
| Knowledge base is empty | Return "No additional knowledge configured" |
| AI summarization fails | Log error, return fallback briefing, proceed with call |
| Briefing exceeds 500 chars | Truncate to 500 chars (AI should respect limit, but guard anyway) |
| Network timeout | Return fallback briefing with retry metadata |
| Cost concerns | Gemini Flash is cheapest non-lite model; use for all projects |

### Testing Approach

1. Deploy `summarize-agent-knowledge` edge function
2. Update `run-test-run` and `tick-campaign` to call the new function
3. Run a test call with 50+ knowledge entries (simulate loaded agent)
4. Verify:
   - Bland accepts call (no 403/400)
   - AI briefing appears in Bland task prompt
   - Agent still handles qualification, follows rules, sounds natural
5. Compare prompt length before/after in logs

### Future Enhancements

- **Context-aware summarization**: Filter knowledge by contact metadata (e.g., state, campaign type)
- **Knowledge caching**: Cache briefing for 1 hour per project (avoid repeated AI calls)
- **Feedback loop**: Track which knowledge entries appear in successful calls → prioritize those
