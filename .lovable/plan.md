

# Upload Business Rules from Word Document

## Change

Add a "Upload from Document" button to the Business Rules section that accepts `.docx`/`.txt` files, sends the content to an edge function that uses AI to extract individual rules, and populates the list UI.

### Frontend: `src/pages/EditAgentPage.tsx`

- Add a hidden file input (`accept=".docx,.txt,.doc,.pdf"`) and an "Upload Document" button (with `Upload` icon) next to the "Add" button
- Add `parsingRules` loading state
- On file select: upload to `agent_knowledge_sources` storage bucket, then invoke a new edge function `parse-business-rules`
- On response: append the returned rules array to existing `businessRules` state

### New Edge Function: `supabase/functions/parse-business-rules/index.ts`

- Accepts `{ file_path }` or `{ text }` in the body
- Downloads file from storage if `file_path` provided
- For `.txt`/`.md`: reads as plain text
- For `.docx`: extracts raw text (best-effort using the file's text content)
- Sends text to Gemini Flash with a prompt: "Extract individual business rules from this document. Each rule should be a single, actionable directive. Return a JSON array of strings."
- Returns `{ rules: string[] }`

### Files Changed
| File | Change |
|------|--------|
| `src/pages/EditAgentPage.tsx` | Add upload button, file input, loading state, invoke edge function, merge rules |
| `supabase/functions/parse-business-rules/index.ts` | New edge function — extract rules from uploaded document via AI |

