

## Move Voicemail Message to Campaign Creation with AI Generate Option

### What Changes

The voicemail message configuration moves from the agent settings page to the campaign creation form. Users get a toggle to enable voicemail and can either write a custom message or have AI generate one based on the agent's profile and campaign name.

### Database

**Add `voicemail_message` column to `campaigns` table:**
```sql
ALTER TABLE campaigns ADD COLUMN voicemail_message text;
```

The existing `voicemail_message` column on `agent_specs` stays for backward compatibility but the campaign-level value takes priority.

### Backend Changes

**File: `supabase/functions/tick-campaign/index.ts`**
- Change voicemail message resolution to check `campaign.voicemail_message` first, then fall back to `spec.voicemail_message`:
```
const vmMessage = campaign.voicemail_message || spec.voicemail_message;
if (vmMessage) {
  globalSettings.voicemail = { action: "leave_message", message: vmMessage };
} else {
  globalSettings.answering_machine_detection = true;
}
```
- Ensure the campaign query includes the `voicemail_message` column.

**New edge function: `supabase/functions/generate-voicemail-message/index.ts`**
- Accepts `{ agent_id, campaign_name }` in the body
- Fetches the agent's name, description, opening line, and tone style from `agent_specs` / `agent_projects`
- Calls Lovable AI (Gemini Flash) with a prompt like: "Write a concise, professional voicemail message (under 30 seconds when spoken) for an AI agent named [name] calling about [campaign]. Match the tone: [tone]. Include a callback prompt."
- Returns `{ message: "..." }`

### Frontend Changes

**File: `src/pages/CampaignsPage.tsx`**

1. Add state variables:
   - `voicemailEnabled` (boolean toggle, default false)
   - `voicemailMessage` (string)
   - `generatingVoicemail` (boolean for loading state)

2. Add a toggle section after the HIPAA toggle (same visual pattern):
   - Toggle: "Leave Voicemail" with description text
   - When enabled, show a textarea for the message
   - Next to the textarea label, add a "Generate with AI" button that calls the new edge function
   - The button shows a spinner while generating and populates the textarea with the result

3. Pass `voicemail_message: voicemailEnabled ? voicemailMessage : null` in the campaign insert.

4. Reset `voicemailEnabled` and `voicemailMessage` after successful creation.

### Summary

| Change | File | What |
|--------|------|------|
| DB migration | SQL | Add `voicemail_message` to `campaigns` |
| Campaign priority | `tick-campaign/index.ts` | Check campaign VM message before agent-level |
| AI generation | New edge function | Generate voicemail message via Lovable AI |
| Campaign form | `CampaignsPage.tsx` | Toggle + textarea + AI generate button |

