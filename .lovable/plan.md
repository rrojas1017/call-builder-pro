

## Make Agent Creation Easier: Templates + Smart Defaults

### What Changes

Three UI improvements to Step 1, 2, and 3 of the agent creation wizard -- all in a single file (`src/pages/CreateAgentPage.tsx`). No backend changes needed.

### 1. Quick-Start Templates (Step 1)

A row of clickable template cards appears above the blank form. Clicking one pre-fills the agent name and description. The user can still ignore templates and type freely.

**Templates:**

| Template | Name Pre-fill | Description Pre-fill |
|---|---|---|
| Health Insurance Pre-Qualifier | Health Insurance Pre-Qualifier | AI agent that calls leads who requested health insurance info, verifies eligibility, collects basic details, and transfers qualified individuals to a licensed agent. |
| Appointment Setter | Appointment Setter | AI agent that calls to schedule or confirm appointments, collects preferred date/time, and sends a confirmation summary. |
| Lead Qualifier | Lead Qualifier | AI agent that calls inbound leads, asks qualifying questions, collects contact info, and routes hot leads to the sales team. |
| Survey / Feedback | Customer Feedback | AI agent that calls customers after a purchase or service to collect satisfaction ratings and open-ended feedback. |
| Inbound Support | Inbound Support | AI agent that handles incoming calls, answers common questions from a knowledge base, and escalates complex issues to a live agent. |

Each card shows the template label and a one-line summary. A subtle "Or describe your own below" divider separates templates from the blank form.

### 2. "Use Defaults & Continue" Button (Step 2)

A secondary outlined button appears next to the existing "Confirm & Review" button on Step 2. Clicking it auto-fills any blank answers with the text "Use your best judgment based on industry standards" and advances directly to Step 3. Users who want control can still answer each question manually.

### 3. Background Audio Default (Step 3)

Change the initial state of `backgroundTrack` from `null` to `"office"`, so the most popular option is pre-selected. Users can still toggle it off or pick a different track.

### Technical Details

| File | Change |
|---|---|
| `src/pages/CreateAgentPage.tsx` | Add `TEMPLATES` array constant. Render template cards grid in Step 1 above the form. Add "Use Defaults" button in Step 2. Change `backgroundTrack` initial state to `"office"`. |

No new files, no new dependencies, no database changes.

