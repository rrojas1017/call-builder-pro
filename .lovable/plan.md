

# Add Contextual Help to Every Edit Agent Section

## Problem
Many sections (especially Qualification Rules, Conversation Flow, Voice Tuning, etc.) use technical jargon without explaining what they do or why a user would change them. Non-technical users are lost.

## Solution
Create a reusable `SectionHelp` component — a small `HelpCircle` icon next to each section title that opens a popover on hover/click with:
- **Plain-language explanation** of what the section does
- **Concrete examples** relevant to the use case
- **Tips** on best practices

## Implementation

### 1. New component: `src/components/SectionHelp.tsx`
A small component using the existing `HoverCard` (hover on desktop) with:
- `HelpCircle` icon trigger (subtle, muted color)
- Content: title, description, examples list, optional tip
- Responsive: works on mobile via click

### 2. Help content map
Define a `SECTION_HELP` constant with entries for every section:

| Section | Plain explanation | Example |
|---|---|---|
| **Identity** | Your agent's display name and internal description | "ACA New Mover Agent" — only you see the description |
| **Language & Mode** | What language the agent speaks + whether it makes or receives calls | Outbound = cold calls, Inbound = answers incoming |
| **Script / Persona** | The fake human name your agent uses on calls | "Sofia Martinez" — pick a name that matches the voice |
| **Opening Line** | The first sentence the agent says when someone picks up | `Hey {{first_name}}, this is {{agent_name}}...` |
| **Tone/Style** | How the agent sounds personality-wise | "friendly and casual" vs "professional and formal" |
| **Success Definition** | What counts as a "win" for this agent | "Caller confirms interest and is transferred to a licensed agent" |
| **Conversation Flow / Must-Collect** | Data the agent MUST gather before transferring or ending | consent, zip_code, income_range, email |
| **Qualification Rules** | Conditions that make a lead "qualified" — if met, agent transfers | `age 18-64, recently moved, no employer coverage` |
| **Disqualification Rules** | Conditions that disqualify a lead — agent politely ends the call | `already has Medicare, under 18` |
| **Compliance** | Legal requirements for the call (recording consent, disclosures) | TCPA consent, state-specific disclosures |
| **Voice** | Which AI voice the agent uses on calls | MiniMax voices sound most natural |
| **Ambient Sound** | Background noise to make the call feel more natural | "Coffee Shop" reduces echo and sounds human |
| **Voice Tuning / Speed** | How fast the agent talks | 1.0 = normal, 0.8 = slower for elderly callers |
| **Temperature** | How creative/unpredictable the agent's responses are | 0.3 = stays on script, 0.9 = improvises more |
| **Interruption Sensitivity** | How quickly the agent stops talking when the caller speaks | Low = lets caller interrupt easily, High = finishes sentences |
| **Call Ending / Transfer** | What happens when the call is done | Transfer = warm handoff to a live person |
| **Business Hours** | When the agent is allowed to make/receive calls | Mon-Fri 9am-5pm ET — calls outside this window are skipped |
| **SMS Follow-up** | Whether to send a text after the call ends | Useful for sending links or confirmations |
| **Voicemail** | Message left if the call goes to voicemail | Keep it under 30 seconds, include a callback number |
| **Advanced / Raw Spec** | Direct JSON editing for power users | Only use if you know what you're doing — overrides all fields above |

### 3. Integration into EditAgentPage
Add `<SectionHelp section="qualification_rules" />` next to each section `<h3>` title. No layout changes — just a small icon inline with the heading.

### Files Changed
- **`src/components/SectionHelp.tsx`** — New reusable help component with all content
- **`src/pages/EditAgentPage.tsx`** — Add `<SectionHelp>` next to every section heading

