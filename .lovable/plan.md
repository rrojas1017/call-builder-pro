

# Feed Uploaded Document Into Agent Knowledge

## Problem
When you upload a document during agent creation, the content is used to generate the initial wizard questions but is **never stored as knowledge entries** that the agent can actually reference during calls. The document text is saved to `agent_projects.source_text` but the agent's runtime prompt only pulls from `agent_knowledge` entries and spec fields -- meaning the detailed information from your document is lost.

Additionally, the knowledge summarization step has a bug that causes it to fail silently, so even existing knowledge entries wouldn't reach the agent.

## Solution

### 1. Auto-create knowledge entries from uploaded document
After `ingest-agent-source` saves the document text to `source_text`, it should also break the content into categorized `agent_knowledge` entries so the agent can reference the full document during calls.

### 2. Fix the knowledge summarization bug
The `summarize-agent-knowledge` function crashes because of a code pattern issue (`.catch()` on an RPC call). Fix the syntax so knowledge entries are properly compressed and injected into the agent's prompt at call time.

---

## Technical Details

### File: `supabase/functions/ingest-agent-source/index.ts`
- After saving `source_text`, call the Lovable AI gateway to break the document into categorized knowledge entries (product_knowledge, objection_handling, conversation_technique, etc.)
- Insert each entry into the `agent_knowledge` table linked to the project
- This ensures the document content persists as searchable, summarizable knowledge the agent uses on every call

### File: `supabase/functions/summarize-agent-knowledge/index.ts`
- Fix line 33: change `.rpc("increment_knowledge_usage", { entry_ids: entryIds }).catch(...)` to use a proper try/catch or `.then()` pattern compatible with the Supabase client version

### Result
- Uploaded documents will feed detailed knowledge entries to the agent
- The agent will have access to the full context from your document during calls, not just the high-level spec fields
- Knowledge summarization will work correctly, compressing entries into a briefing injected into every call prompt

