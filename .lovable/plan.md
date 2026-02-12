
# Test Lab Integration into Create Agent Wizard - Step 3

## Overview
Integrate the Test Lab feature directly into **Step 3 of the CreateAgentPage.tsx wizard**, allowing users to test their agent with real Bland API calls (5 sample contacts, 1 default concurrency) before launching the full campaign. Users can provide contacts via **manual entry (textarea)** OR **file upload (CSV/XLSX)**, but not both in one test.

---

## 1. Database Schema: New Tables

### `test_runs`
```sql
CREATE TABLE test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES agent_projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'running', 'completed', 'failed')) DEFAULT 'draft',
  max_calls int NOT NULL DEFAULT 5,
  concurrency int NOT NULL DEFAULT 1,
  agent_instructions_text text,
  spec_version int DEFAULT 1,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
);
```

### `test_run_contacts`
```sql
CREATE TABLE test_run_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'calling', 'completed', 'failed', 'no_answer', 'voicemail', 'busy')) DEFAULT 'queued',
  bland_call_id text,
  transcript text,
  extracted_data jsonb,
  evaluation jsonb,
  duration_seconds int,
  outcome text,
  error text,
  created_at timestamp DEFAULT now(),
  called_at timestamp
);
```

### RLS Policies
- Both tables use org_id isolation via the test_runs table
- Users can only view/edit test runs within their organization

---

## 2. Edge Functions

### A. `parse-dial-list` (NEW)
**Purpose**: Parse CSV/XLSX files and normalize phone numbers  
**Input**:
```typescript
{
  file_content: string,  // Base64-encoded or raw text
  file_type: 'csv' | 'xlsx'
}
```
**Output**:
```typescript
[
  { name: string, phone: string },
  ...
]
```
**Logic**:
- For CSV: split by lines, split each line by comma, extract name (col 0) and phone (col 1)
- For XLSX: use lightweight SheetJS from esm.sh to parse
- Normalize phone: strip non-digits, prepend +1 if 10 digits, validate length (10-15)
- Return normalized array or error

---

### B. `create-test-run` (NEW)
**Purpose**: Initialize test run with contacts  
**Input**:
```typescript
{
  project_id: string,
  name: string,
  max_calls: number (default 5),
  concurrency: number (default 1),
  contacts: { name: string, phone: string }[],
  agent_instructions_text?: string  // optional override
}
```
**Output**:
```typescript
{
  test_run_id: string,
  contacts_count: number
}
```
**Logic**:
- Load org_id from project_id
- Insert test_run record with status='draft'
- Insert test_run_contacts rows (limited to max_calls)
- Return test_run_id

---

### C. `run-test-run` (NEW)
**Purpose**: Initiate real Bland calls for queued contacts  
**Input**:
```typescript
{
  test_run_id: string
}
```
**Output**:
```typescript
{
  initiated_count: number,
  call_ids: string[]
}
```
**Logic**:
- Load test_run and its queued contacts
- Load agent_spec for the project
- For each contact (up to `concurrency`):
  - Build Bland API payload:
    - phone_number: contact.phone
    - task: agent_instructions_text OR buildTaskPrompt(spec)
    - first_sentence: spec.opening_line
    - transfer_phone_number: spec.transfer_phone_number (if needed)
    - record: true
    - webhook_url: `{SUPABASE_URL}/functions/v1/receive-bland-webhook`
    - metadata: { test_run_id, test_run_contact_id, org_id, project_id, spec_version }
  - POST to https://api.bland.ai/v1/calls
  - Update contact status to 'calling', set called_at
- Update test_run status to 'running'
- Return call count

---

### D. Update `receive-bland-webhook` (MODIFY)
**Logic Change**: Route by metadata presence
```typescript
if (metadata.test_run_contact_id) {
  // TEST LAB FLOW
  // Update test_run_contacts row: transcript, status, outcome, duration_seconds, extracted_data
  // Call evaluate-call (adapted for test context)
  // Call run-test-run to pick next queued contacts
  
} else {
  // EXISTING CAMPAIGN FLOW (unchanged)
  // Update calls + contacts rows, call evaluate-call, call tick-campaign
}
```

---

## 3. Frontend: Step 3 Integration

### Modified UI Structure (Step 3)

**Part A: Agent Summary** (unchanged)
- Plain-English summary cards (Who it calls, What it says, etc.)
- Edit Details button

**Part B: Test Lab Section** (NEW)
```
┌─────────────────────────────────────────┐
│  Test Your Agent (5 Sample Calls)       │
│  ─────────────────────────────────────  │
│                                         │
│  [ Manual Entry ] [ Upload File ]       │
│                                         │
│  Manual Entry Tab:                      │
│  ┌─────────────────────────────────────┐
│  │ Paste contacts (one per line):      │
│  │ Name, Phone                         │
│  │                                     │
│  │ John Doe, +15551234567              │
│  │ Jane Smith, +15559876543            │
│  │                                     │
│  │ (Shows: 2 contacts parsed)          │
│  └─────────────────────────────────────┘
│                                         │
│  OR                                     │
│                                         │
│  Upload File Tab:                       │
│  ┌─────────────────────────────────────┐
│  │ [ Choose CSV / XLSX File ]          │
│  │ (Shows parsed preview: 2 contacts)  │
│  └─────────────────────────────────────┘
│                                         │
│  Concurrency: [1] (read-only for now)  │
│                                         │
│  [ Run 5 Test Calls ]                   │
└─────────────────────────────────────────┘

AFTER "Run Test Calls" is clicked:

┌─────────────────────────────────────────┐
│  Test Results (Modal / Slide-out)       │
│  ─────────────────────────────────────  │
│                                         │
│  Status: Running... (1/2 completed)    │
│                                         │
│  Results Table:                         │
│  ┌──────────┬────────┬──────────────┐  │
│  │ Name     │ Status │ Score / Err  │  │
│  ├──────────┼────────┼──────────────┤  │
│  │ John Doe │ ✓ Done │ 87 (good)    │  │
│  │ Jane ... │ ⏳ Call │ --           │  │
│  └──────────┴────────┴──────────────┘  │
│                                         │
│  [View Details] [Download Transcript]  │
└─────────────────────────────────────────┘

Call Detail View (click row):
- Full transcript
- Extracted data (key-value)
- Evaluation: compliance/objective/overall scores
- Issues detected
- Recommended improvements
- [Apply Fix] button per improvement
```

**Part C: Launch Campaign** (UNCHANGED but below Test Lab)
```
Campaign Name, Max Concurrent, Contacts (CSV)
[Launch Campaign] button
```

---

## 4. CreateAgentPage.tsx Changes (Step 3)

### New State Variables:
```typescript
// Test Lab state
const [testLabMode, setTestLabMode] = useState<'manual' | 'upload' | null>(null);
const [manualContacts, setManualContacts] = useState("");
const [uploadedFile, setUploadedFile] = useState<File | null>(null);
const [parsedTestContacts, setParsedTestContacts] = useState<{ name: string; phone: string }[]>([]);
const [testRunId, setTestRunId] = useState<string | null>(null);
const [testRunning, setTestRunning] = useState(false);
const [testResults, setTestResults] = useState<any[]>([]);
const [showTestResults, setShowTestResults] = useState(false);
const [selectedTestResult, setSelectedTestResult] = useState<any | null>(null);
```

### New Handler Functions:

**parseManualContacts()**:
- Split manualContacts textarea by line
- Extract name, phone from each line (name, phone format)
- Normalize phone using same logic as parse-dial-list edge function
- Set parsedTestContacts
- Show preview

**handleFileUpload()**:
- Read file as Base64 or text
- Call parse-dial-list edge function
- Set parsedTestContacts
- Show preview

**handleRunTest()**:
- Create test_run with contacts
- Call create-test-run edge function
- Call run-test-run edge function
- Show results modal
- Poll for updates every 2 seconds (refetch test_run_contacts)
- When all calls complete or timeout, close modal

**handleApplyFix(improvement)**:
- Call apply-improvement edge function
- Increment spec version
- Optionally auto-run test again (with updated spec)

---

## 5. UI Components

### TestLabSection.tsx (sub-component in Step 3)
- Tab/toggle between Manual and Upload
- Manual: textarea for "Name, Phone" entries
- Upload: file input for CSV/XLSX
- Preview table: shows parsed contacts
- Run button, loading state
- Integrates with CreateAgentPage state

### TestResultsModal.tsx (new)
- Modal or slide-out drawer
- Shows live progress and results table
- Click row → detail view
- Detail view: transcript + evaluation + fix button

---

## 6. Webhook Routing (receive-bland-webhook)

```typescript
const metadata = body.metadata || {};

if (metadata.test_run_contact_id) {
  // TEST LAB FLOW
  const { error: updateErr } = await supabase
    .from("test_run_contacts")
    .update({
      transcript,
      status: contactStatus,
      bland_call_id: blandCallId,
      duration_seconds: duration,
      outcome: outcome,
      extracted_data: extractedData,
      called_at: new Date().toISOString(),
    })
    .eq("id", metadata.test_run_contact_id);
  
  if (updateErr) console.error("Error updating test_run_contacts:", updateErr);

  // Trigger evaluate-call (same as before)
  if (upsertedCall?.id && transcript && contactStatus === "completed") {
    const evalUrl = `${supabaseUrl}/functions/v1/evaluate-call`;
    fetch(evalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ 
        call_id: upsertedCall.id,
        test_run_contact_id: metadata.test_run_contact_id 
      }),
    }).catch((e) => console.error("Error triggering evaluate-call:", e));
  }

  // Trigger run-test-run to pick next contact
  if (metadata.test_run_id) {
    fetch(`${supabaseUrl}/functions/v1/run-test-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ test_run_id: metadata.test_run_id }),
    }).catch((e) => console.error("Error triggering run-test-run:", e));
  }
} else {
  // EXISTING CAMPAIGN FLOW (unchanged)
  ...
}
```

---

## 7. Integration Points

### Files to Create:
1. `supabase/functions/parse-dial-list/index.ts` — Parse CSV/XLSX
2. `supabase/functions/create-test-run/index.ts` — Initialize test
3. `supabase/functions/run-test-run/index.ts` — Execute calls
4. `src/components/TestLabSection.tsx` — UI component for Step 3
5. `src/components/TestResultsModal.tsx` — Results display

### Files to Modify:
1. `supabase/migrations/xxx_test_lab.sql` — Create tables + RLS
2. `supabase/functions/receive-bland-webhook/index.ts` — Add routing
3. `supabase/functions/evaluate-call/index.ts` — Support test context (optional: store in test_run_contacts.evaluation)
4. `supabase/config.toml` — Register new functions
5. `src/pages/CreateAgentPage.tsx` — Add Step 3 test lab UI + handlers
6. `src/integrations/supabase/types.ts` — Auto-update after migration

---

## 8. UX Flow

1. User completes Steps 1 & 2 (describe + answer questions)
2. Step 3 shows agent summary + **Test Lab section**
3. User chooses **Manual Entry** or **Upload File**
4. Contacts are parsed and previewed
5. User clicks **"Run 5 Test Calls"**
6. Modal opens, calls execute in real-time (with progress)
7. User sees results: transcripts, scores, issues
8. User can **"Apply Fix"** to any recommended improvement
9. Optionally re-run test with updated spec
10. When satisfied, scroll down and **"Launch Campaign"** with full dial list

---

## 9. Key Design Decisions

- **Max 5 test calls** by default (non-configurable in UI for simplicity, but settable in code)
- **Concurrency = 1** by default (non-configurable for simplicity)
- **Manual vs. Upload**: Toggle/tab, but only one active per test run (not cumulative)
- **Real Bland calls**: Every test run uses actual Bland API (no mock)
- **Test data isolation**: metadata.test_run_id routes to test_run_contacts, NOT campaign contacts
- **No analytics mixing**: test_runs are completely separate from campaigns
- **Apply Fix loop**: Users can refine spec and re-test within Step 3 before launching
- **Phone normalization**: Consistent logic for both manual and file-based entry

---

## 10. Sequencing

1. Database migration (test_runs + test_run_contacts + RLS)
2. Edge functions: parse-dial-list, create-test-run, run-test-run
3. Update receive-bland-webhook routing
4. Update evaluate-call to store in test_run_contacts.evaluation
5. Update config.toml
6. Frontend components: TestLabSection.tsx, TestResultsModal.tsx
7. Integrate into CreateAgentPage.tsx Step 3
8. Test end-to-end: Create agent → Answer questions → Run test (manual) → View results → Apply fix → Re-test → Launch campaign

