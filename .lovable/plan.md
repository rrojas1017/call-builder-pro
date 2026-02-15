

## Integrate WhatsApp AI Chat

### Overview
Add WhatsApp as a conversational AI channel so your agents can automatically answer questions from their knowledge base, qualify leads, and follow up after calls -- all over WhatsApp.

### Provider Recommendation
**Twilio** is the recommended path. It provides a WhatsApp Business API wrapper with simpler setup (no Meta Business verification process), webhook support out of the box, and pay-per-message pricing. Meta Cloud API is cheaper at scale but requires more setup (Meta Business Manager, app review, etc). You can always migrate later.

You will need:
- A Twilio account with WhatsApp Sender (Twilio Sandbox works for testing)
- Twilio Account SID, Auth Token, and WhatsApp-enabled phone number

---

### Changes

#### 1. Database: New tables for WhatsApp conversations

Create `whatsapp_conversations` and `whatsapp_messages` tables (separate from SMS to keep channel logic clean):

- **whatsapp_conversations**: `id`, `org_id`, `project_id`, `wa_number` (contact's WhatsApp number), `status` (active/closed), `created_at`, `updated_at`
- **whatsapp_messages**: `id`, `conversation_id`, `direction` (inbound/outbound), `body`, `twilio_message_sid`, `status`, `created_at`
- RLS policies scoped to org_id

#### 2. Edge Function: `receive-whatsapp-webhook`

Twilio sends incoming WhatsApp messages to this webhook. It will:
1. Parse the incoming message (sender number, body)
2. Find or create a `whatsapp_conversation` by matching the sender number to an org's WhatsApp-enabled agent
3. Store the inbound message
4. Load the agent's knowledge summary and spec
5. Call Gemini Flash with conversation history + knowledge context to generate a reply
6. Send the reply back via Twilio's Messages API
7. Store the outbound message

#### 3. Edge Function: `send-whatsapp-message`

A callable function for sending proactive messages (post-call follow-ups). Accepts `to_number`, `project_id`, `message` and sends via Twilio API.

#### 4. Configuration: Agent WhatsApp settings

Add `whatsapp_number` column to `agent_specs` so each agent can be linked to a WhatsApp number. This is used by the webhook to route incoming messages to the correct agent.

#### 5. Frontend: WhatsApp Conversations page

New page at `/whatsapp` accessible from the sidebar showing:
- List of active WhatsApp conversations for the current agent
- Click into a conversation to see the full message thread
- Manual reply input (sends via `send-whatsapp-message`)

#### 6. Post-call follow-up trigger

Update the `receive-bland-webhook` function to optionally trigger a WhatsApp follow-up message after a completed call if the agent has `whatsapp_number` configured and the contact's number is available.

---

### Secrets Required
- `TWILIO_ACCOUNT_SID` -- Your Twilio Account SID
- `TWILIO_AUTH_TOKEN` -- Your Twilio Auth Token
- `TWILIO_WHATSAPP_NUMBER` -- Your Twilio WhatsApp sender number (e.g. `whatsapp:+14155238886`)

---

### Technical Details

The webhook endpoint will be registered in `supabase/config.toml` with `verify_jwt = false` since Twilio calls it directly. Twilio request signature validation will be implemented to verify authenticity.

The AI chat uses the existing `callAI` helper from `_shared/ai-client.ts` with Gemini Flash for fast responses. The system prompt will include the agent's knowledge summary (from `agent_knowledge_summary` in `agent_specs`) and conversation history for context continuity.

Message flow:

```text
User (WhatsApp) --> Twilio --> receive-whatsapp-webhook
  --> Load agent spec + knowledge
  --> AI generates reply (Gemini Flash)
  --> Twilio API sends reply
  --> User sees response in WhatsApp
```

