

## Add Learning Progress Dashboard and Fix Knowledge Gap

### Problem 1: Winning Patterns Not Reaching Agents
The `learn-from-success` function saves patterns as `category: "winning_pattern"`, but `buildTaskPrompt.ts` only recognizes `product_knowledge`, `objection_handling`, `industry_insight`, and `competitor_info`. Similarly, `conversation_technique` entries (111 in the DB) are also dropped from the DOMAIN KNOWLEDGE section. These categories only survive if the 500-char AI briefing happens to include them -- which is unreliable.

### Problem 2: No Progress Visibility
There's no UI to track whether the learning loop is working. Users can't see if lessons are being applied or if scores improved.

---

### Fix 1: Include Missing Categories in Prompt Builder

**File: `src/lib/buildTaskPrompt.ts`**

Add `winning_pattern` and `conversation_technique` to the category label map (line 41-46):

```typescript
const labels: Record<string, string> = {
  product_knowledge: "PRODUCT KNOWLEDGE",
  objection_handling: "OBJECTION HANDLING",
  industry_insight: "INDUSTRY INSIGHTS",
  competitor_info: "COMPETITOR AWARENESS",
  winning_pattern: "WINNING PATTERNS",           // NEW
  conversation_technique: "CONVERSATION TIPS",    // NEW
};
```

Also update the backend copy at `supabase/functions/_shared/buildTaskPrompt.ts` with the same change.

### Fix 2: Add Learning Progress Section to Agent Knowledge Page

**File: `src/pages/AgentKnowledgePage.tsx`**

Add a summary stats bar at the top of the Knowledge page showing:
- Total knowledge entries by source (Auto-researched / Evaluation / Manual / Success patterns)
- Score trend (fetch last 5 `score_snapshots` and show if scores are improving)
- Last learning activity timestamp
- A simple timeline of recent learning events

This uses existing data from `agent_knowledge`, `score_snapshots`, and `improvements` tables -- no new tables needed.

### Fix 3: Add `winning_pattern` to Knowledge Page Categories

**File: `src/pages/AgentKnowledgePage.tsx`**

Add the missing category to the `CATEGORIES` array so users can see and manage winning patterns:

```typescript
{ value: "winning_pattern", label: "Winning Patterns", icon: "trophy" },
```

---

### Technical Summary

| File | Change |
|---|---|
| `src/lib/buildTaskPrompt.ts` | Add `winning_pattern` and `conversation_technique` to category labels |
| `supabase/functions/_shared/buildTaskPrompt.ts` | Same category label update (backend copy) |
| `src/pages/AgentKnowledgePage.tsx` | Add winning_pattern category; add learning progress stats section at top |

### What This Achieves
- All 229 knowledge entries (including 111 conversation techniques) will now reliably appear in agent prompts
- Users get visibility into whether the system is actually learning
- Winning patterns extracted from successful calls are surfaced in the UI and fed to agents
