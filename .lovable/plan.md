

# Fix: Business Rules Document Upload Fails for Binary Files

## Problem

The `parse-business-rules` edge function downloads the uploaded file and calls `await fileData.text()` on it regardless of file type (line 31). This works for `.txt` and `.md` files, but for `.docx` and `.pdf` files it returns binary garbage. The AI then either:
- Gets gibberish and returns no rules, or
- Throws "No text content found in document" because the binary text is nonsensical

The frontend accepts `.docx, .doc, .txt, .pdf, .md` — but the backend can only actually process `.txt` and `.md`.

## Fix

### `supabase/functions/parse-business-rules/index.ts`

Add file-type detection and proper handling:

1. **For `.txt` / `.md`**: Keep current `fileData.text()` approach — works fine.

2. **For `.docx`**: Use a Deno-compatible DOCX parser. The simplest approach is to extract the `word/document.xml` from the ZIP archive (DOCX is a ZIP file), then strip XML tags to get plain text. Use Deno's built-in `JSZip` or the `fflate` library via esm.sh.

3. **For `.pdf`**: PDF text extraction in Deno is limited. Two options:
   - Use the AI model itself — send the raw file as a base64-encoded attachment (Gemini supports PDF input natively)
   - Use a lightweight PDF-to-text library via esm.sh

4. **For `.doc` (legacy Word)**: Not feasible to parse in an edge function. Show a clear error asking the user to convert to `.docx` or `.txt`.

**Recommended approach** — Use Gemini's native document understanding:
- For `.pdf` and `.docx`, convert the file to base64 and send it directly to Gemini as a file part instead of extracting text first. Gemini 2.5 Flash natively handles PDFs and can read DOCX content.
- This eliminates the need for any parsing library and handles all formatting, tables, and complex layouts.

**Implementation:**
```
// After downloading fileData:
const fileName = file_path.toLowerCase();
const isPlainText = fileName.endsWith(".txt") || fileName.endsWith(".md");

if (isPlainText) {
  rawText = await fileData.text();
} else {
  // For PDF/DOCX — send as file part to Gemini
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const base64 = btoa(String.fromCharCode(...bytes));
  const mimeType = fileName.endsWith(".pdf") ? "application/pdf" : 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  
  // Call Gemini with file content directly
  // (need to check if callAI supports file parts, 
  //  or make a direct Gemini API call)
}
```

**Important**: Need to check if the shared `callAI` helper supports multimodal file inputs. If not, either extend it or make a direct API call to Gemini for binary files.

Also add a guard for `.doc` files:
```
if (fileName.endsWith(".doc") && !fileName.endsWith(".docx")) {
  throw new Error("Legacy .doc format is not supported. Please convert to .docx or .txt");
}
```

### Frontend: `src/pages/EditAgentPage.tsx`

Remove `.doc` from the accept list since it can't be parsed:
```
accept=".docx,.txt,.pdf,.md"
```

| File | Change |
|------|--------|
| `supabase/functions/parse-business-rules/index.ts` | Add file-type branching; use Gemini native PDF/DOCX input for binary files; reject `.doc` |
| `src/pages/EditAgentPage.tsx` | Remove `.doc` from accepted file types |

