

# Enhanced Campaign Export System + CRM Webhook Push

## Problem
The current export dumps all contacts regardless of outcome. With 500+ records, users need filtered exports and automated CRM pushes for successful calls.

## What we'll build

### 1. Filtered Export on Campaign Detail Page
Replace the current single "Export" button with an export dropdown that lets users choose:
- **All contacts** — current behavior
- **Successful calls only** — qualified, transferred, completed
- **By outcome** — pick specific outcomes (qualified, disqualified, voicemail, no_answer, etc.)
- **By list** — if campaign has multiple lists, filter by originating list

The export will include all details: name, phone, outcome, transcript, extracted data (flattened into columns), score, recording URL, duration, called_at.

### 2. CRM Webhook Configuration (per campaign or per org)
Add a `webhook_url` column to the `campaigns` table. When a call completes with a "successful" outcome (qualified, transferred, completed), the webhook fires automatically from `receive-retell-webhook` with the full payload including extracted data.

This lets users point to Zapier, Make, HubSpot, or any CRM endpoint.

### 3. Org-level webhook fallback
Add a `webhook_url` column to `organizations` for a default CRM webhook that fires for all successful calls across all campaigns (unless the campaign has its own).

## Technical changes

### Database migration
```sql
ALTER TABLE campaigns ADD COLUMN webhook_url text;
ALTER TABLE organizations ADD COLUMN webhook_url text;
```

### File: `src/pages/CampaignDetailPage.tsx`
- Replace the Export button with a `DropdownMenu` offering filter presets: "All", "Successful Only", "By Outcome..." (opens a checkbox picker), "By List..."
- The selected filter applies to the existing contacts array before CSV generation
- Add a "CRM Webhook" field in the campaign edit form (simple text input for URL)

### File: `supabase/functions/receive-retell-webhook/index.ts`
- After the call record is upserted in the standard flow, check if the campaign or org has a `webhook_url`
- If outcome is successful (qualified, transferred, completed) and a webhook URL exists, POST the full call data (contact info, extracted_data, transcript, outcome, duration, recording_url) to that URL
- Fire-and-forget (don't block the webhook response)

### File: `src/pages/CampaignDetailPage.tsx` (edit form)
- Add webhook_url to the edit form fields and save logic

## Export payload structure
Each row will include dynamically flattened `extracted_data` columns so CRM imports work cleanly:
```
Name, Phone, Outcome, Duration, Transcript, Score, Recording URL, Called At, [extracted_data keys as individual columns]
```

## Webhook payload structure
```json
{
  "event": "call_completed",
  "campaign_id": "...",
  "campaign_short_id": "CMP-0001",
  "contact": { "name": "...", "phone": "..." },
  "outcome": "qualified",
  "duration_seconds": 180,
  "transcript": "...",
  "extracted_data": { "state": "FL", "age": "45", ... },
  "recording_url": "...",
  "timestamp": "..."
}
```

