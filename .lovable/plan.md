

## Add HIPAA Compliance Badge per Call in Campaign Detail

### Context

HIPAA (Health Insurance Portability and Accountability Act) is the correct compliance framework for healthcare campaigns. The system already has a `hipaa_enabled` toggle on campaigns and the AI evaluator already produces a `compliance_score` for every call. This feature connects the two: when a campaign has HIPAA enabled, each call row in the contacts table shows a visual compliance badge based on the evaluation results.

### What it does

For HIPAA-enabled campaigns, every contact row in the campaign detail table gets a small shield badge indicating whether the agent handled the call in a HIPAA-compliant manner:

- **Green shield + "Compliant"**: compliance_score >= 80
- **Yellow shield + "Partial"**: compliance_score between 50-79
- **Red shield + "Non-Compliant"**: compliance_score below 50
- **Gray shield + "Pending"**: no evaluation yet

This gives campaign managers an at-a-glance compliance audit view without clicking into each contact.

### Layout in the contacts table

```text
| Name  | Phone | Status | Attempts | Duration | Outcome | Compliance    | Called At |
|-------|-------|--------|----------|----------|---------|---------------|----------|
| Alice | ...   | Done   | 1        | 2m 30s   | qual.   | [shield] Pass | Jan 15   |
| Bob   | ...   | Done   | 2        | 1m 45s   | qual.   | [shield] Fail | Jan 15   |
| Carol | ...   | Queued | 0        | --       | --      | [shield] --   | --       |
```

### Technical details

**File: `src/pages/CampaignDetailPage.tsx`**

1. **Contacts table** (around line 582-636): Add a "Compliance" column header and cell, only rendered when `campaign.hipaa_enabled` is true
2. The cell reads `call?.evaluation?.compliance_score` and renders:
   - A `ShieldCheck` icon colored green/yellow/red based on score thresholds
   - A short text label ("Pass", "Partial", "Fail", or "--" for no evaluation)
3. **Contact detail drawer** (around line 640+): Add a prominent HIPAA compliance status banner at the top of the drawer when the campaign is HIPAA-enabled, showing the compliance score with the same color coding

No database changes needed -- `hipaa_enabled` already exists on campaigns, and `compliance_score` already exists in the call evaluation JSON.

### Summary of changes

| Area | Change |
|---|---|
| CampaignDetailPage contacts table | Add conditional "Compliance" column with shield badge when HIPAA enabled |
| CampaignDetailPage contact drawer | Add HIPAA compliance status banner at top of drawer |

