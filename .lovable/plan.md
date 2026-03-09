

# External API Knowledge Source

## Overview
Add an optional feature that lets users configure external API endpoints per agent. Before each call, the system queries those APIs and includes live data in the agent's knowledge briefing.

## Changes

### 1. Database: `knowledge_api_endpoints` table
New table with columns: `id`, `project_id` (uuid), `org_id` (uuid), `name` (text), `endpoint_url` (text), `http_method` (text, default GET), `headers` (jsonb, default {}), `query_template` (text, nullable), `response_path` (text, nullable -- dot notation like `data.results`), `enabled` (boolean, default true), `last_synced_at` (timestamptz), `last_status` (text), `created_at` (timestamptz).

RLS policies following existing org-scoped pattern: admins can manage (ALL), org members can view (SELECT), super admins can view all (SELECT).

### 2. UI: Add "API Sources" tab on AgentKnowledgePage
Add a new top-level tab "🔌 API Sources" alongside existing category tabs. Contains:
- List of configured endpoints with name, URL, method, enabled toggle, last status indicator
- "Add API Source" dialog with fields: name, URL, HTTP method (GET/POST), headers (key-value pairs), response path, optional query template
- "Test Connection" button per endpoint that calls the fetch edge function and shows a preview of returned data
- Edit/delete actions per endpoint

### 3. Edge Function: `fetch-api-knowledge/index.ts`
New function that:
- Accepts `project_id` and optional `caller_context` (name, phone)
- Fetches all enabled `knowledge_api_endpoints` for the project (using service role)
- Calls each endpoint with configured method/headers, substituting `{{caller_name}}` / `{{phone}}` placeholders in query_template
- Extracts data using `response_path` (dot-notation traversal)
- Updates `last_synced_at` and `last_status` on each endpoint
- Returns combined text block of all API responses
- 10-second timeout per endpoint, errors logged but non-fatal

### 4. Update `summarize-agent-knowledge/index.ts`
Before the AI summarization step, call `fetch-api-knowledge` internally (direct function call, not HTTP) to get live API data. Append it to `rawText` with `[api_source: <name>]` prefix so the AI compressor includes it in the briefing.

### 5. Config
Add `[functions.fetch-api-knowledge] verify_jwt = false` to config.toml.

### Files Changed
- **Database migration** -- `knowledge_api_endpoints` table + RLS
- **`src/pages/AgentKnowledgePage.tsx`** -- API Sources tab with CRUD UI + test button
- **`supabase/functions/fetch-api-knowledge/index.ts`** -- new edge function
- **`supabase/functions/summarize-agent-knowledge/index.ts`** -- integrate API data

