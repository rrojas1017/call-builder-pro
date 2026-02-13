

## Connect SMS via ClickSend

### Overview
Integrate ClickSend as the SMS provider so AI agents can use SMS as a journey/campaign strategy. This adds the ability to send SMS messages, track conversations, and enable SMS as a channel on a per-agent basis.

### Prerequisites
You'll need a ClickSend account with API credentials:
1. Sign up at [clicksend.com](https://www.clicksend.com)
2. Go to the dashboard and click "API Credentials" in the top right
3. You'll need your **API Username** and **API Key**

We'll securely store both as backend secrets.

### What We'll Build

1. **Two new secrets** -- `CLICKSEND_USERNAME` and `CLICKSEND_API_KEY`
2. **Two new database tables** -- `sms_conversations` and `sms_messages`
3. **New column on `agent_specs`** -- `sms_enabled` boolean
4. **New backend function** -- `manage-sms` for sending/receiving SMS via ClickSend
5. **New SMS page** -- View conversations and send messages
6. **Navigation + routing updates** -- SMS entry in sidebar, new route

### Database Changes

**New table: `sms_conversations`**
- `id` (uuid, PK, default gen_random_uuid())
- `org_id` (uuid, FK to organizations, not null)
- `project_id` (uuid, FK to agent_projects, nullable) -- which agent handles this
- `from_number` (text) -- the number messages are sent from
- `to_number` (text) -- the recipient's number
- `status` (text, default 'active')
- `created_at`, `updated_at` (timestamptz)
- RLS: scoped to user's org via `get_user_org_id()`

**New table: `sms_messages`**
- `id` (uuid, PK, default gen_random_uuid())
- `conversation_id` (uuid, FK to sms_conversations)
- `direction` (text) -- 'outbound' or 'inbound'
- `body` (text)
- `clicksend_message_id` (text, nullable)
- `status` (text, default 'queued') -- queued, sent, delivered, failed
- `created_at` (timestamptz)
- RLS: scoped via join to sms_conversations.org_id

**Alter `agent_specs`**: Add `sms_enabled` (boolean, default false)

### New Backend Function: `manage-sms`

Actions:
- **`send`** -- Send an SMS via ClickSend `POST /v3/sms/send` (Basic Auth), log the message in `sms_messages`, auto-create conversation if needed
- **`list_conversations`** -- Fetch conversations for the user's org
- **`get_messages`** -- Fetch messages for a given conversation

ClickSend API details:
- Base URL: `https://rest.clicksend.com`
- Auth: Basic HTTP (`username:api_key` base64 encoded)
- Send endpoint: `POST /v3/sms/send` with body `{ messages: [{ to, body, source, from }] }`

### New Page: `SMSPage.tsx`

- Left panel: list of conversations (grouped by contact number)
- Right panel: message thread for selected conversation
- Compose area at the bottom to send a new SMS
- Button to start a new conversation (enter phone number + message)
- Shows message status (sent, delivered, failed)

### Navigation and Routing Updates

- **`AppSidebar.tsx`**: Add "SMS" item under DEPLOY section with `MessageSquare` icon, path `/sms`
- **`App.tsx`**: Add protected route `/sms` pointing to `SMSPage`

### Agent Configuration Update

- **`EditAgentPage.tsx`**: Add an "SMS Channel" section with a toggle switch to enable/disable SMS for the agent. Similar styling to the existing "Background Audio" toggle section.

### Files to Create
1. `supabase/functions/manage-sms/index.ts`
2. `src/pages/SMSPage.tsx`

### Files to Modify
1. `src/components/AppSidebar.tsx` -- Add SMS nav item
2. `src/App.tsx` -- Add `/sms` route + import
3. `src/pages/EditAgentPage.tsx` -- Add SMS toggle section
4. Database migration -- New tables + alter agent_specs

