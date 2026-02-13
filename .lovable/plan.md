
## Problem Summary

The task prompt is ballooning to 30,000+ characters due to:
1. **FPL/SEP Tables**: ~3,000 characters of mostly static reference data that the agent doesn't need verbatim
2. **Knowledge Entries**: Up to 20 entries (~8,000 chars) being dumped raw with all formatting
3. **Humanization Notes**: Up to 15+ techniques (~3,000-6,000 chars) listed exhaustively
4. **Base Template**: ~2,500 chars of detailed instructions

This forces Bland AI to reject calls, and the current fix (truncation) silently loses context at the end.

## Solution: Compact-by-Design Prompt Architecture

### 1. **Compress FPL/SEP Tables into Rules (Save ~2,500 chars)**

**Current**: Full table (56 lines) + 11 QLE examples
**New**: Replace with concise rule summary

Instead of:
```
Household Size | 100% FPL  | 400% FPL
1              | $14,580   | $58,320
...
```

Use:
```
FPL QUALIFICATION: Income must fall between 100-400% of Federal Poverty Level for their household size. (For reference: Single = $14.6k-$58k; Family of 4 = $30k-$120k; Add $5.1k per person beyond 8 for 100% FPL, multiply by 4 for 400% FPL.)

ENROLLMENT TIMING: If outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a recent life event (loss of coverage, marriage, birth, move, citizenship). No life event = direct them to next Open Enrollment. Income alone doesn't qualify.
```

**Result**: ~800 chars instead of 3,000 chars. Agent still understands qualification logic without memorizing tables.

### 2. **Compress Knowledge Entries via Summarization (Save ~4,000 chars)**

**Current**: All 20 entries listed raw with category headers

**New**: Create a `buildCompactKnowledgePrompt` function that:
- Groups entries by category as before
- Limits each category to **3-4 most recent entries** instead of all
- Uses inline formatting instead of numbered lists:
  ```
  PRODUCT KNOWLEDGE: [Entry1]. [Entry2]. [Entry3].
  ```
- Truncates long entries: if > 150 chars, take first 150 chars + "..." 

**Result**: ~1,500-2,000 chars instead of 8,000 chars.

### 3. **Condense Humanization Notes into Style Guide (Save ~2,000 chars)**

**Current**: 15+ techniques listed individually:
```
1. Use 43/57 talk-to-listen ratio...
2. Apply the Two-Second Rule pause...
```

**New**: Consolidate into a **single, compact "interaction style"** section:
```
INTERACTION STYLE: Be warm and natural. Listen more than you talk (43/57 ratio). Pause for 2 seconds after questions. Add light humor. Use their name occasionally. Acknowledge each response before moving on.
```

**Result**: ~200-300 chars instead of 2,500+ chars. All techniques captured without enumeration.

### 4. **Streamline Base Template (Slight reduction, keep clarity)**

- Remove redundant instructions (e.g., "use casual transitions" + "add small talk" = combine into one)
- Keep critical sections: PURPOSE, RULES, INTERACTION STYLE, DOMAIN KNOWLEDGE, DISCLOSURE, FIELDS, FPL RULES, TRANSFER
- Remove narrative elaboration; use bullet points exclusively

**Result**: ~1,500 chars instead of 2,500 chars.

### 5. **Implement Smart Capping**

- **Knowledge**: Limit to 10 entries (vs. 20), prioritize recent ones
- **Humanization**: Feed first 10 global behaviors into compact style guide, then apply the summarization from (3) above
- **Final Guard**: If > 28,000 chars, progressively trim: knowledge → humanization → domain knowledge

## Implementation Details

**Files to Modify:**
1. **`supabase/functions/run-test-run/index.ts`**:
   - Replace inline FPL/SEP table generation with `buildCompactFplSepRule()` function
   - Create `buildCompactKnowledgePrompt()` to replace `buildKnowledgeSection()`
   - Create `buildCompactHumanizationStyle()` to merge global behaviors into a single style guide
   - Cap knowledge to 10 entries instead of 20
   - Merge all humanization into one-paragraph style guide
   - Keep `MAX_TASK_LENGTH = 28000` guard

2. **`src/lib/buildTaskPrompt.ts`** (optional, for consistency):
   - Add `buildCompactFplSepRule()` export
   - Simplify the exported `buildTaskPrompt()` to use compact functions (for frontend test page previews if needed)

## Expected Outcome

- **Before**: 30,000-32,000 chars (fails Bland)
- **After**: ~15,000-18,000 chars (safe margin, room for contact-specific variables)
- **No lost context**: All critical rules, knowledge, and style guidance preserved in condensed form
- **Scalability**: Adding more knowledge or behaviors won't exceed 30k limit

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Agent "forgets" FPL thresholds | The compact rule includes actual numbers and formulas; agent can compute on the fly |
| Knowledge entries too truncated | Limit to 10 entries of highest importance; let users prioritize what's critical |
| Humanization loses nuance | One-paragraph style guide is tighter but covers all themes: warmth, listening, pauses, humor, name usage |
| Bland still rejects | Keep `MAX_TASK_LENGTH = 28000` hard guard; if hit, progressively trim knowledge section |

## Testing Approach

1. Deploy changes to `run-test-run/index.ts`
2. Run a test call with multiple knowledge entries + humanization notes
3. Verify Bland accepts the call (no 400 error)
4. Check agent's response quality: Does it still handle qualification, follow rules, and sound natural?
5. Apply same logic to `tick-campaign/index.ts` for campaign calls

