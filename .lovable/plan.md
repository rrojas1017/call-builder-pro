

# Knowledge Base Redesign: Agent-Centric Intelligence Hub

## Overview
Replace the current basic file-upload Knowledge Base page (`/knowledge`) with an intelligent, agent-centric knowledge management hub. Users first select an AI agent, then upload and manage all knowledge sources for that agent. After uploads, an AI-powered wizard analyzes the data and asks pertinent follow-up questions to maximize how the knowledge is used. Recordings are automatically detected, transcribed, and analyzed with insights shown before ingestion.

## What Changes

### 1. Agent Selector as the Entry Point
The `/knowledge` page becomes a hub. On load, it shows all available agents as selectable cards. Once an agent is selected, the full knowledge management interface appears for that agent -- reusing and enhancing the existing `AgentKnowledgePage` logic.

If only one agent exists, it auto-selects.

### 2. Smart Upload with AI Wizard
After uploading files (documents, recordings, images, URLs), a post-upload wizard kicks in:
- The system sends all uploaded content summaries to an AI model (Gemini 3 Flash)
- The AI generates 3-8 targeted follow-up questions specific to the uploaded data (e.g., "This document mentions a 30-day return policy -- should the agent mention this proactively or only when asked?")
- User answers are saved as additional knowledge entries with a `wizard_followup` source type
- This ensures the AI agent truly understands the context behind the raw data

### 3. Recording Detection and Pre-Ingestion Analysis
When a recording is uploaded:
- The system detects the audio file type automatically
- Before ingesting, it transcribes and runs an analysis pass
- Shows a preview panel with: transcript summary, detected speakers, key topics, and a breakdown of how insights will be categorized (objection handling, winning patterns, etc.)
- User can review and confirm before the insights are saved

### 4. Knowledge Usage Tracking
Each knowledge entry shows how it has been used:
- A `usage_count` field tracks how many times a knowledge entry was included in an agent's task prompt
- Entries display badges like "Used in 12 calls" or "Never used"
- This helps users understand which knowledge is valuable vs. dead weight

### 5. Retire the Old KnowledgeBasePage
The old `KnowledgeBasePage` (which uploads to a `knowledge_docs` bucket tied to user ID, not agents) is replaced entirely. The route `/knowledge` now points to the new agent-centric hub.

## Technical Details

### Database Changes

**Add columns to `agent_knowledge` table:**
```text
ALTER TABLE agent_knowledge ADD COLUMN usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE agent_knowledge ADD COLUMN file_name text;
ALTER TABLE agent_knowledge ADD COLUMN insights_preview jsonb;
```

### New Edge Function: `knowledge-wizard`
Receives the project_id and recently uploaded entry IDs. Uses Gemini 3 Flash to:
1. Read the content of those entries
2. Generate follow-up questions tailored to the data
3. Return a JSON array of questions with rationale

Called from the frontend after a successful upload batch completes.

### Files to Create
- `supabase/functions/knowledge-wizard/index.ts` -- AI wizard that generates follow-up questions based on uploaded content

### Files to Modify
- `src/pages/KnowledgeBasePage.tsx` -- Complete rewrite: agent selector, knowledge list, upload flow with wizard, usage indicators
- `src/App.tsx` -- No route change needed (still `/knowledge`), but remove the old import if the component name changes
- `supabase/functions/ingest-knowledge-source/index.ts` -- Add `file_name` to the inserted rows
- `supabase/functions/transcribe-and-ingest/index.ts` -- Return a transcript preview/summary before final ingestion (add `preview` mode)

### Knowledge Wizard Flow
```text
1. User selects agent
2. User uploads files/URLs/recordings
3. System ingests content (existing flow)
4. System calls knowledge-wizard with new entry IDs
5. Wizard returns 3-8 questions
6. User answers questions in a step-by-step dialog
7. Answers saved as knowledge entries (source_type: "wizard_followup")
8. Dialog closes, knowledge list refreshes
```

### Recording Analysis Flow
```text
1. User drops audio file
2. System uploads to storage
3. System calls transcribe-and-ingest with preview=true
4. Returns: transcript summary, speaker count, topic breakdown, categorized insights preview
5. User reviews and clicks "Confirm & Ingest"
6. System calls transcribe-and-ingest with preview=false to save
```

### Agent Selector UI
- Grid of agent cards showing: agent name, knowledge entry count, last updated, maturity level
- Click to select, which loads the full knowledge management panel below
- Breadcrumb: Knowledge Base > [Agent Name]

### Usage Tracking Implementation
- Increment `usage_count` in the `buildTaskPrompt` edge function when knowledge entries are pulled into a prompt
- Display as a subtle badge on each entry card: "Used 12x" in green or "Unused" in muted

### Implementation Order
1. Database migration (add columns)
2. Create `knowledge-wizard` edge function
3. Rewrite `KnowledgeBasePage.tsx` with agent selector and enhanced upload flow
4. Update `ingest-knowledge-source` to store file_name
5. Add usage count increment logic to prompt building

