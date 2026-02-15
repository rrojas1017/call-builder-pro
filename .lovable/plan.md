

## Add "Trusted Outbound Numbers" Feature

### What This Does

Lets you save outbound phone numbers that came through clean (no spam flag) so you can reuse them on future calls. When a number works well, you mark it as "trusted" and the system will prefer it for outgoing calls.

### How It Works

1. **New "Outbound Numbers" table** in the database to store numbers per organization with a status (trusted / flagged / retired)
2. **UI on the Settings page** (or a new dedicated tab) where you can:
   - See all outbound numbers that have been used
   - Mark numbers as "trusted" (keep) or "flagged" (avoid)
   - Add notes (e.g., "clean on AT&T", "flagged on T-Mobile")
3. **Agent-level number selection**: In agent settings, instead of a single `from_number` text field, you pick from your trusted numbers list
4. **Call dispatch integration**: When making calls, the system picks from your trusted numbers pool rather than letting Bland assign a random one

### Technical Details

| Change | Details |
|---|---|
| **New DB table: `outbound_numbers`** | Columns: `id`, `org_id`, `phone_number`, `label`, `status` (trusted/untrusted/retired), `notes`, `last_used_at`, `created_at`. RLS scoped to org. |
| **Settings UI update** | Add an "Outbound Numbers" section to Settings page with a table showing saved numbers, status badges, and add/edit/retire actions. |
| **Agent spec UI update** | Replace the free-text `from_number` field with a dropdown populated from the org's trusted outbound numbers. |
| **`tick-campaign` + `run-test-run` updates** | When dispatching calls, if no specific `from_number` is set on the spec, rotate through the org's trusted numbers to distribute load and reduce spam risk. |

### Files to Create/Modify

- **New migration**: Create `outbound_numbers` table with RLS policies
- `src/pages/SettingsPage.tsx`: Add outbound numbers management section
- `src/pages/CreateAgentPage.tsx` / `src/pages/EditAgentPage.tsx`: Replace `from_number` text input with dropdown from trusted numbers
- `supabase/functions/tick-campaign/index.ts`: Pull from trusted numbers pool when dispatching
- `supabase/functions/run-test-run/index.ts`: Same pool logic for test runs

