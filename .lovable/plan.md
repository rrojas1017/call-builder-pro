

## Fix Template Staleness and Skip-Questions Risk

### Problem 1: Static Templates Get Stale

The current `TEMPLATES` array is hardcoded. If adoption is low on some, they become clutter. Maintaining them is manual overhead.

**Solution: Replace templates with "Example Prompts"**

Instead of rigid template cards that pre-fill the form, show 3-4 rotating example prompts as placeholder-style inspiration chips above the textarea. Clicking one pastes it into the description field as a starting point the user is expected to edit -- not a finished template.

This shifts from "pick a category" to "here's how to describe what you need," which:
- Never goes stale (they're just example sentences, not product categories)
- Encourages users to customize rather than blindly accept
- Removes the maintenance burden entirely

The chips would look like: `"Calls leads to verify insurance eligibility and transfer qualified ones"` / `"Schedules appointments and sends confirmations"` / `"Surveys customers after purchases for feedback"`

Clicking one fills the description textarea. The agent name field stays blank for the user to name it themselves.

### Problem 2: "Use Defaults & Continue" Is a Blind Skip

Currently the button auto-fills blanks with "Use your best judgment based on industry standards" and immediately advances. The user never sees what they're agreeing to.

**Solution: Change to "Review Defaults" flow**

Instead of skipping directly, clicking the button:
1. Fills all blank answers with the AI-suggested `suggested_default` values (the actual defaults from the spec generation, not a generic string)
2. Stays on Step 2 so the user can review what was filled in
3. Shows a subtle toast: "Defaults applied -- review and adjust if needed"
4. The user then clicks "Confirm & Review" as normal

This keeps the speed benefit (one click fills everything) while giving users a chance to catch anything wrong before it gets baked into the agent spec.

### Technical Details

| File | Change |
|---|---|
| `src/pages/CreateAgentPage.tsx` | Replace `TEMPLATES` array with `EXAMPLE_PROMPTS` array of short description strings. Replace template card grid with a row of clickable chips that fill the description textarea only. Change "Use Defaults & Continue" button to fill answers with each question's original `suggested_default` (stored from the generate-spec response) instead of a generic string, then stay on Step 2 with a toast notification. |

No backend changes. No new files.

