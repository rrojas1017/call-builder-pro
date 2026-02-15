

## Add Document & URL Uploads to Agent Knowledge Base

### What This Enables

Users can feed their agents with company policies, product manuals, FAQs, and any reference material by uploading documents (PDFs, spreadsheets, text files) or pasting URLs directly into the Knowledge Base page. The system extracts the text content and stores it as searchable knowledge entries the agent can reference during calls.

### How It Works

1. **On the Agent Knowledge page**, the existing "Add Knowledge" button gets a companion: an "Upload Sources" button that opens a dialog with two options:
   - **Upload files** -- drag-and-drop or click to upload PDFs, CSVs, Excel (.xlsx), and text files (up to 20MB each, max 5 at a time)
   - **Paste a URL** -- enter a webpage URL and the system fetches and extracts its content

2. **Files are stored in a storage bucket** (`agent_knowledge_sources`), and the extracted text is saved as knowledge entries in the existing `agent_knowledge` table with `source_type: "document"` or `source_type: "url"`.

3. **A new backend function** (`ingest-knowledge-source`) handles the heavy lifting:
   - For text/CSV files: reads the content directly
   - For PDFs and Excel: uses Lovable AI (Gemini Flash) to summarize the document content into digestible knowledge entries
   - For URLs: fetches the page content and extracts the main text
   - Splits large documents into multiple knowledge entries by topic/section

### User Experience

- Go to any agent's Knowledge page
- Click "Upload Sources"
- Drop a PDF of your company's return policy, or paste your FAQ page URL
- The system processes it and creates multiple categorized knowledge entries automatically
- Each entry shows a "Document" or "URL" badge so you know where it came from
- You can edit or delete any auto-created entry just like manual ones

### Technical Details

| Change | Details |
|---|---|
| **New storage bucket** | `agent_knowledge_sources` -- stores uploaded files, with RLS so only org members can access their agents' files |
| **New edge function** | `ingest-knowledge-source` -- accepts file_path or url, extracts text, uses AI to split into categorized knowledge entries, saves to `agent_knowledge` |
| **Modified file** | `src/pages/AgentKnowledgePage.tsx` -- add "Upload Sources" button and dialog with file upload zone + URL input field |
| **Modified file** | `src/pages/AgentKnowledgePage.tsx` -- add "Document" and "URL" source type badges to the existing badge renderer |

### Processing Pipeline

For uploaded files:
1. Frontend uploads file to `agent_knowledge_sources/{project_id}/{timestamp}_{filename}`
2. Frontend calls `ingest-knowledge-source` with `{ project_id, file_path }`
3. Edge function downloads file from storage, extracts raw text (plain text for .txt/.csv, best-effort for others)
4. Sends text to Gemini Flash with instructions to split into categorized knowledge entries (product_knowledge, objection_handling, etc.)
5. Inserts resulting entries into `agent_knowledge` table

For URLs:
1. Frontend calls `ingest-knowledge-source` with `{ project_id, url }`
2. Edge function fetches the URL content
3. Same AI processing as above to extract and categorize

### What Stays the Same

- Manual "Add Knowledge" entry still works exactly as before
- All existing auto-research, evaluation, and success-learning entries are unaffected
- The knowledge summarization pipeline that feeds into the agent's prompt is unchanged -- it just has more entries to work with

