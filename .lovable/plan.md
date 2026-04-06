

# Add Agent Reassignment on Campaign Detail Page

## What's happening now
- When creating a campaign, there's already an agent selector dropdown — that part works.
- On the campaign detail page, the assigned agent shows as a read-only badge (line 516-519).
- There's no way to change the agent after the campaign is created.

## What we'll build
Add an editable agent selector on the campaign detail page, similar to how concurrency is already editable (click to edit, save button).

## Changes

**File: `src/pages/CampaignDetailPage.tsx`**

1. Fetch the list of available agents (`agent_projects`) alongside the existing data load, so we have options to pick from.
2. Replace the read-only agent badge (line 516-519) with a click-to-edit pattern: clicking the agent name opens a `Select` dropdown inline, with a save button — matching the existing concurrency edit UX.
3. On save, update `campaigns.project_id` and `campaigns.agent_project_id` to the new agent ID, then refresh state.

This is a small UI addition (~30 lines) confined to the campaign detail page header area.

