

## Remove All Twilio / WhatsApp Resources

Since Twilio is not being used, this plan removes every trace of the WhatsApp+Twilio integration cleanly.

### What will be removed

#### 1. Delete edge function files
- **`supabase/functions/send-whatsapp-message/`** -- entire directory
- **`supabase/functions/receive-whatsapp-webhook/`** -- entire directory
- Delete the deployed edge functions from the backend as well

#### 2. Delete the frontend page
- **`src/pages/WhatsAppPage.tsx`** -- entire file

#### 3. Clean up App.tsx
- Remove the `import WhatsAppPage` line
- Remove the `<Route path="/whatsapp" ...>` route

#### 4. Clean up AppSidebar.tsx
- Remove the `"/whatsapp": MessageSquare` icon mapping (and the `MessageSquare` import if no longer used elsewhere)

#### 5. Clean up supabase/config.toml
- Remove the `[functions.receive-whatsapp-webhook]` entry
- Remove the `[functions.send-whatsapp-message]` entry

#### 6. Clean up receive-bland-webhook
- Remove the WhatsApp follow-up block (lines 285-313) that triggers a WhatsApp message after a completed call

#### 7. Database migration
- Drop the `whatsapp_messages` table (and its RLS policies)
- Drop the `whatsapp_conversations` table (and its RLS policies)
- Drop the `whatsapp_number` column from `agent_specs`

### What stays untouched
- SMS tables and functions remain unaffected (they use ClickSend, not Twilio)
- All other edge functions, pages, and routes remain intact
- No Twilio secrets exist in the environment, so nothing to delete there

### Technical details

The database migration will run:
```sql
DROP TABLE IF EXISTS whatsapp_messages;
DROP TABLE IF EXISTS whatsapp_conversations;
ALTER TABLE agent_specs DROP COLUMN IF EXISTS whatsapp_number;
```

Order matters: `whatsapp_messages` has a foreign key to `whatsapp_conversations`, so it must be dropped first.

