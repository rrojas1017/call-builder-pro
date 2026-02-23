

# Fix "Bucket not found" Error on Agent Creation

## Problem
When creating a new agent with a document upload, the app throws "Bucket not found" because the code uploads to a storage bucket called `agent_sources` which does not exist. The only existing bucket is `agent_knowledge_sources`.

## Solution
Create the missing `agent_sources` storage bucket via a database migration.

### Database Migration
Run SQL to create the `agent_sources` bucket with appropriate RLS policies:
- Create the bucket (private, not public)
- Add RLS policy on `storage.objects` allowing authenticated users to upload files to this bucket
- Add RLS policy allowing the service role (edge functions) to read/download files

### Files Changed

| File | Change |
|------|--------|
| Database migration (SQL) | Create `agent_sources` bucket + RLS policies for upload/download |

No code changes needed -- both `CreateAgentPage.tsx` and `ingest-agent-source/index.ts` already reference the correct bucket name `agent_sources`. The bucket just needs to exist.

### Technical Details

```text
SQL Migration:
1. INSERT INTO storage.buckets (id, name, public) VALUES ('agent_sources', 'agent_sources', false)
2. CREATE POLICY for authenticated users to INSERT (upload) objects
3. CREATE POLICY for authenticated users to SELECT (download) their own objects
4. Service role access is automatic (bypasses RLS)
```

