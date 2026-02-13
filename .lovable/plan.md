

## Fix: Task Prompt Exceeding Bland's 30,000 Character Limit

### Problem
Bland AI rejects the call because the generated task prompt exceeds 30,000 characters. The main contributors:
- 106 global human behaviors being merged into humanization notes (potentially 10,000+ chars)
- 42 knowledge entries totaling ~12,000 chars  
- 6,000 chars of existing humanization notes
- ~3,000 chars of health-specific sections (FPL table, SEP rules)
- ~2,000 chars of base template

### Solution: Add a prompt truncation strategy

**File: `supabase/functions/run-test-run/index.ts`**

1. **Cap global human behaviors**: Instead of merging all 106 global behaviors, limit to the most recent 10. These are meant as examples, not an exhaustive list.

2. **Cap knowledge entries**: Limit to 15 entries (prioritizing shorter, more impactful ones) or truncate total knowledge section to 8,000 chars max.

3. **Add a final length guard**: After building the full prompt, if it still exceeds 29,000 chars (leaving buffer), truncate the knowledge and humanization sections proportionally.

### Implementation details

**Changes to `supabase/functions/run-test-run/index.ts`:**

After loading global behaviors (around line 250), limit the count:
```typescript
// Limit global behaviors to most recent 15
const globalTechniques = (globalBehaviors || [])
  .slice(-15)
  .map((g: any) => g.content as string);
```

After building the full prompt (end of `buildTaskPrompt`), add a length guard:
```typescript
// Ensure prompt stays under Bland's 30k char limit
const MAX_TASK_LENGTH = 29000;
if (prompt.length > MAX_TASK_LENGTH) {
  prompt = prompt.substring(0, MAX_TASK_LENGTH) + "\n\n[Prompt truncated for length]";
}
```

Also limit knowledge entries passed into the prompt builder:
```typescript
// Cap knowledge to prevent oversized prompts
const knowledge: KnowledgeEntry[] = (knowledgeRows || []).slice(0, 20) as KnowledgeEntry[];
```

### Files to modify
- `supabase/functions/run-test-run/index.ts` -- cap global behaviors, cap knowledge, add length guard

### No other changes needed
- No database changes
- No frontend changes
- No new files
