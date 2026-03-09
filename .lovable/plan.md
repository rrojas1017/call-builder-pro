

# Auto-Sync on Save — Remove Manual "Sync Settings to Append" Button

## Problem
Users see both a "Save Changes" button and a separate "Sync Settings to Append" button inside the RetellAgentManager. This is confusing — saving should automatically push changes to the telephony provider without a second manual step.

## Solution
1. **`src/pages/EditAgentPage.tsx`** — After the database save succeeds in `handleSave`, automatically invoke `manage-retell-agent` with `action: "update"` to push voice, language, and name changes to Retell. Show a single toast confirming both save and sync.

2. **`src/components/RetellAgentManager.tsx`** — Remove the "Sync Settings to Append" button and the duplicate refresh/sync button from the status card header. Keep only the status display card (showing agent ID, voice, language, webhook status) and the advanced "Change Agent ID" collapsible. The component becomes read-only status info rather than an action panel.

## Files Changed
- **`src/pages/EditAgentPage.tsx`** — Add auto-sync call after DB save
- **`src/components/RetellAgentManager.tsx`** — Remove sync button, keep status card only

