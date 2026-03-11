

# Fix DOCX Upload: Extract Text Instead of Sending Binary to Gemini

## Problem
The current code sends `.docx` files as binary to Gemini's multimodal API, but Gemini only supports PDFs and images — not Word documents. This causes a 400 error.

## Fix

### `supabase/functions/parse-business-rules/index.ts`

**For `.docx` files**: Extract text by unzipping the file (DOCX is a ZIP archive), reading `word/document.xml`, and stripping XML tags. Then send the extracted text through the existing `extractRulesFromText` path — no multimodal needed.

**For `.pdf` files**: Keep the current Gemini multimodal approach — PDFs are natively supported.

The routing becomes:
- `.txt` / `.md` / `.csv` → read as text → `extractRulesFromText()`
- `.docx` → unzip, extract XML, strip tags → `extractRulesFromText()`
- `.pdf` → base64 encode → `extractRulesFromBinary()` (Gemini multimodal)

**Implementation details:**
1. Import `JSZip` from `esm.sh` for ZIP extraction
2. Add an `extractTextFromDocx(bytes)` helper that:
   - Loads the DOCX bytes as a ZIP
   - Reads `word/document.xml`
   - Strips XML tags, normalizes whitespace
3. Update the main handler so `.docx` goes through the text path instead of the binary path

| File | Change |
|------|--------|
| `supabase/functions/parse-business-rules/index.ts` | Add JSZip import, DOCX text extraction, route `.docx` through text path |

