

## AI-Powered Smart List Upload

### Problem
Currently, uploading a CSV requires the user to manually select the phone column, name column, and review/confirm the data. This is unnecessary friction -- AI can handle all of this automatically, similar to how the agent creation wizard works.

### New Flow

Upload a file and the system does everything:

1. **User drops a CSV** (no change here)
2. **AI analyzes the file** -- a new edge function sends a sample of the CSV to AI, which returns:
   - A smart list name based on the file content (e.g., "Texas Health Leads - Feb 2026")
   - The phone column (auto-detected)
   - The name column (auto-detected)
   - A field mapping: which columns map to known contact fields (state, zip, email, age, etc.)
   - Data quality notes (e.g., "12 rows missing phone numbers -- these will be skipped")
   - Cleaned/normalized phone numbers (strip formatting, add +1 if needed)
3. **Show a brief confirmation card** -- not the current manual form, but a summary of what AI decided, with a single "Import" button. The user can see what AI detected but doesn't have to change anything.

### Changes

**1. Update Edge Function: `supabase/functions/parse-dial-list/index.ts`**

After the existing CSV parsing logic, add an AI analysis step:
- Send the first 10 rows + all detected headers to Gemini via the shared `ai-client.ts`
- AI prompt asks it to return structured JSON with:
  - `suggested_name`: A descriptive list name based on content patterns
  - `phone_column`: Which header is the phone number
  - `name_column`: Which header is the contact name  
  - `field_map`: Maps each header to a semantic role (phone, name, email, state, zip, age, company, notes, etc.) or "other"
  - `quality_notes`: Array of observations (missing data, formatting issues)
  - `skip_count`: How many rows should be skipped (no phone number)
- Fall back to the existing heuristic detection if AI fails
- Return the AI analysis alongside the existing parsed data

**2. Update `src/pages/ListsPage.tsx`**

Replace the manual preview/confirm step with a streamlined AI-powered flow:

- **New step: "analyzing"** -- shows an animated card saying "AI is analyzing your file..." with a progress feel
- **New step: "confirm"** -- replaces the old "preview" step with a clean summary card:
  - AI-suggested list name (editable, but pre-filled)
  - Auto-detected column mapping shown as badges (e.g., "Phone: mobile_number", "Name: full_name", "State: state")
  - Quality summary (e.g., "247 valid contacts, 3 skipped -- missing phone")
  - A collapsible "Preview data" section (collapsed by default) showing the first 5 rows
  - Single "Import 247 Contacts" button
- Remove the phone column and name column dropdowns entirely
- Phone number normalization: strip non-digits, ensure proper format before saving
- Skip rows where the AI-detected phone column is empty

**3. Data Cleaning on Save**

In the `handleSave` function:
- Filter out rows where the phone column value is empty or not a valid phone number
- Normalize phone numbers (strip formatting, add country code if needed)
- Store the AI-generated `field_map` in the `dial_lists` record for downstream use by campaigns

### UI Layout (Confirm Step)

```text
+------------------------------------------+
| Ready to Import                          |
|                                          |
| List Name: [Texas Health Leads - Feb '26]|
|                                          |
| Detected Fields:                         |
| [Phone: mobile] [Name: full_name]        |
| [State: state] [Zip: zip_code]           |
| [Email: email] [Other: notes]            |
|                                          |
| 247 valid contacts | 3 skipped (no phone)|
|                                          |
| > Preview data (collapsed)               |
|                                          |
| [Import 247 Contacts]    [Cancel]        |
+------------------------------------------+
```

### What stays the same
- Existing list display cards unchanged
- Database schema unchanged (dial_lists + dial_list_rows)
- File input accepts .csv only
- Batch insert logic for rows
