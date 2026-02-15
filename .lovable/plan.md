

## Add HIPAA Compliance Toggle to Campaign Builder

### What it does

Adds a prominent HIPAA compliance toggle to the campaign creation form. When enabled, the campaign is stored and visually labeled as HIPAA-compliant everywhere it appears -- in the campaign list, detail page, and the agent's prompt gets additional HIPAA-specific instructions injected automatically.

### What HIPAA mode activates

When the toggle is ON, the system will:

1. **Visual labeling** -- A shield badge ("HIPAA") appears on the campaign card in the list and on the detail page header, so it's always clear this campaign operates under compliance rules.

2. **Call recording disclosure** -- Injects a mandatory recording disclosure line into the agent's opening prompt (e.g., "This call may be recorded for quality and compliance purposes").

3. **PHI minimization instructions** -- Adds prompt-level guardrails telling the agent to:
   - Never read back full SSN, DOB, or policy numbers
   - Only confirm last 4 digits of sensitive identifiers
   - Not store or repeat medical diagnoses verbatim in conversation

4. **Consent-first enforcement** -- Adds a prompt instruction requiring the agent to obtain explicit verbal consent before collecting any health-related information.

5. **Voicemail safe mode** -- Injects instructions that voicemail messages must NOT contain any PHI -- only a callback number and generic message.

### Technical details

**1. Database migration** -- Add a `hipaa_enabled` boolean column to `campaigns`:

```sql
ALTER TABLE public.campaigns
ADD COLUMN hipaa_enabled boolean NOT NULL DEFAULT false;
```

**2. File: `src/pages/CampaignsPage.tsx`**

- Add `hipaaEnabled` state (default `false`)
- Add a Switch toggle in the campaign creation form with a label like "HIPAA Compliance Mode" and a brief explanation
- Pass `hipaa_enabled: hipaaEnabled` in the insert payload
- Update the `Campaign` interface to include `hipaa_enabled: boolean`
- In the campaign list cards, show a shield badge next to the status when `hipaa_enabled` is true

**3. File: `src/pages/CampaignDetailPage.tsx`**

- Read `hipaa_enabled` from the campaign data
- Display a prominent "HIPAA" shield badge in the campaign header when enabled

**4. File: `supabase/functions/tick-campaign/index.ts`**

- Read `campaign.hipaa_enabled` (already fetched via `select("*")`)
- When true, append HIPAA guardrail instructions to the task prompt before sending to the call API:

```typescript
if (campaign.hipaa_enabled) {
  task += `\n\n=== HIPAA COMPLIANCE RULES ===
- This call is recorded. You MUST disclose this at the start: "This call may be recorded for quality and compliance purposes."
- NEVER read back full SSN, date of birth, or policy/member ID numbers. Only confirm last 4 digits.
- Do NOT repeat or store specific medical diagnoses, conditions, or medication names in conversation summaries.
- You MUST obtain explicit verbal consent before collecting any health-related information.
- If leaving a voicemail: leave ONLY a callback number and a generic message. Do NOT include any health information, names of conditions, or reason for calling.
- Minimize collection of Protected Health Information (PHI) to only what is strictly necessary for the conversation objective.`;
}
```

### UI Layout

The HIPAA toggle sits in the campaign creation form between the redial settings and the list selector:

```text
+-------------------------------------------+
| HIPAA Compliance Mode          [  Toggle ] |
| Shield icon  Enable HIPAA-compliant call   |
|              handling for this campaign.    |
|              Adds recording disclosure,     |
|              PHI minimization, and consent  |
|              requirements to agent prompts. |
+-------------------------------------------+
```

When enabled, campaign cards show:

```text
| Q1 ACA Outreach                           |
| [running] [HIPAA] Jan 15, 2026            |
```

### Summary of changes

| Area | Change |
|---|---|
| Database | Add `hipaa_enabled` boolean column to `campaigns` |
| Campaign builder (CampaignsPage) | Add Switch toggle, save to DB, show badge on list |
| Campaign detail (CampaignDetailPage) | Show HIPAA shield badge in header |
| Campaign engine (tick-campaign) | Inject HIPAA guardrail prompt rules when enabled |

