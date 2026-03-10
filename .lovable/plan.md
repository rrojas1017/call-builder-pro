

# Change Business Rules to List-Style UI (matching Must-Collect Fields)

## Change

Replace the current `Textarea` in the Business Rules section with the same add/remove/drag-reorder list pattern used by Must-Collect Fields.

### `src/pages/EditAgentPage.tsx`

**State changes (line ~100):**
- Change `businessRules` from `string` to `string[]`
- Add `newBusinessRule` string state

**Load logic (lines ~178-186):**
- Parse `spec.business_rules` — if object with `text` key, split by newlines into array; if `rules` array, use directly; if string, split by newlines

**Save logic (line ~320):**
- Serialize as `{ rules: businessRules }` instead of `{ text: ... }`

**Backend compatibility check:**
- `buildTaskPrompt.ts` reads `business_rules` — need to handle both `{ text }` and `{ rules: [] }` formats, or serialize the array back to text on save

**Add drag handlers** (reuse the existing `draggedIndex`/`dragOverIndex` pattern or create a second set like `brDraggedIndex`/`brDragOverIndex`)

**UI (lines 724-739):**
Replace the Textarea with:
- List of draggable items (each rule as a full-width card, not a badge — since rules are long sentences)
- Each item: grip icon + rule text + X remove button
- Input + "Add" button at bottom
- Items displayed as bordered rows (not badges) since business rules are multi-line/long text

### Rendering difference from Must-Collect
Must-Collect uses inline `Badge` chips — that works for short field names. Business rules are full sentences, so each item will render as a bordered row (`rounded-lg border p-3`) with the grip handle on the left and remove button on the right, similar to the screenshot.

### Files Changed
| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Convert Business Rules from textarea to list UI with add/remove/drag-reorder |
| `src/lib/buildTaskPrompt.ts` | Handle `{ rules: [] }` format in addition to `{ text }` |

