

# SMS Follow-up: Add Script Configuration When Toggle is Enabled

## What Changes

When the SMS Follow-up toggle is enabled, expand the section to show two options:

1. **Custom SMS Script** — A textarea where users write their own follow-up message template with placeholder variables (e.g., `{{name}}`, `{{outcome}}`)
2. **AI-Generated Follow-up** — A toggle/radio that tells the system to auto-generate the SMS based on the call transcript and outcome (no manual script needed)

A helper note explains each mode clearly.

## Database Change

Add two new columns to `agent_specs`:
- `sms_script` (text, nullable) — stores the custom SMS template
- `sms_mode` (text, default `'ai_generated'`) — either `'ai_generated'` or `'custom_script'`

## File Changes

### `src/pages/EditAgentPage.tsx`
- Add state for `smsMode` (`'ai_generated' | 'custom_script'`) and `smsScript` (string)
- Load from `agent_specs` on fetch, save on `handleSave`
- When `smsEnabled` is true, expand the SMS section to show:
  - Two radio buttons: "AI-Generated" (default) and "Custom Script"
  - If "AI-Generated": show a read-only note explaining the AI will craft a personalized follow-up from the call transcript
  - If "Custom Script": show a textarea with placeholder guidance (e.g., `Hi {{name}}, thanks for chatting with us today...`)

### Database Migration
```sql
ALTER TABLE agent_specs
  ADD COLUMN sms_mode text NOT NULL DEFAULT 'ai_generated',
  ADD COLUMN sms_script text;
```

