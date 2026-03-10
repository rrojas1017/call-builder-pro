

# Detect "Add as Business Rule" Intent from Verbal Feedback

## What It Does
When a user records verbal feedback after a test call (University page, TestResultsModal, or LiveSimulationChat), the system checks the transcribed text for phrases like "add this as a business rule" or "add the following as a rule." Instead of routing through the normal `apply-audit-recommendation` repair flow, it shows a confirmation prompt asking the user to save the extracted rule directly to `business_rules.rules[]`.

## How It Works

### 1. New utility: `src/lib/addBusinessRule.ts`
- A helper that fetches the current `business_rules` from `agent_specs`, appends a new rule string (deduplicating), and updates the row
- Used by all three feedback surfaces

### 2. Intent detection helper: `src/lib/detectBusinessRuleIntent.ts`
- A small function that checks transcribed text against patterns like:
  - "add this as a business rule"
  - "add the following as a business rule"  
  - "save this as a rule"
  - "make this a business rule"
- Returns `{ isBusinessRule: true, ruleText: "..." }` where `ruleText` is the content after stripping the trigger phrase
- If no match, returns `{ isBusinessRule: false }`

### 3. `src/pages/UniversityPage.tsx` — feedback flow change
- After `transcribeAudio` populates `feedbackText`, check for business rule intent
- If detected: instead of the normal "Submit Feedback" button behavior, show a secondary action — a highlighted "Save as Business Rule" button (with `BookmarkPlus` icon)
- Clicking it calls `addBusinessRule(projectId, ruleText)` directly, bypassing `apply-audit-recommendation`
- The normal "Submit Feedback" button still works for non-rule feedback
- Add state: `detectedRule: string | null` — set after transcription when intent is detected

### 4. `src/components/TestResultsModal.tsx` — same treatment
- After transcription, detect intent and show "Save as Business Rule" button when matched

### 5. `src/components/LiveSimulationChat.tsx` — same treatment  
- In the general feedback textarea, detect intent on submit and route accordingly

### Files Changed
| File | Change |
|------|--------|
| `src/lib/addBusinessRule.ts` | New — direct append to `agent_specs.business_rules.rules[]` |
| `src/lib/detectBusinessRuleIntent.ts` | New — regex intent detection + rule text extraction |
| `src/pages/UniversityPage.tsx` | After transcription, detect intent → show "Save as Business Rule" button |
| `src/components/TestResultsModal.tsx` | Same intent detection + button |
| `src/components/LiveSimulationChat.tsx` | Same intent detection on feedback submit |

No backend changes needed — writes directly to `agent_specs` via existing RLS.

