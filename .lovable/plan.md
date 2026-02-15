

## Add "Teacher Briefing" to University Test Calls

### Problem
When a user receives a University test call, they have no guidance on how to act. They need to play along as a realistic prospect while also deliberately challenging the AI to expose weaknesses and train it.

### Solution
Add a "Teacher Briefing" card that appears in the University UI when a test call starts. This card gives the human tester a generated persona and challenge scenarios based on the agent's spec (industry, objections, qualification rules). The briefing is generated via AI before the call begins.

### Changes

**1. New Edge Function: `supabase/functions/generate-teacher-briefing/index.ts`**
- Accepts `project_id`
- Reads the agent spec (use_case, qualification_rules, disqualification_rules, must_collect_fields, tone_style)
- Calls Lovable AI (Gemini Flash) to generate a short briefing with:
  - A fake persona (name, age, situation)
  - 3-4 challenge scenarios to test (e.g., "Act confused about your income", "Say you already have employer coverage", "Interrupt mid-sentence")
  - A difficulty level hint (easy/medium/hard, randomized)
- Returns the briefing as structured JSON

**2. Frontend: `src/pages/UniversityPage.tsx`**
- After clicking "Run Test Call", before the call connects, fetch the teacher briefing
- Display a new "Teacher Briefing" card between the form and the Live Call Monitor with:
  - The generated persona details ("You are: Maria, 34, recently divorced, lost coverage 2 months ago")
  - Challenge checklist ("Try these: refuse to give your zip code at first, ask what company they're from, mention you already spoke to someone")
  - A difficulty badge
- The card stays visible during the call so the user can reference it
- Card collapses/hides once the call completes

### UI Layout

```text
+------------------------------------------+
| Teacher Briefing                    Hard  |
|------------------------------------------|
| YOUR PERSONA: Maria Torres, 34           |
| Recently divorced, lost employer coverage |
| 2 months ago. Household of 2. ~$38k/yr.  |
|                                          |
| CHALLENGE THE AI:                        |
| [ ] Be vague about your income at first  |
| [ ] Ask "Who is this? How'd you get my   |
|     number?"                             |
| [ ] Interrupt during the disclosure      |
| [ ] Say you're "not sure" about your zip |
+------------------------------------------+
```

### Technical Details

The edge function prompt instructs AI to generate a persona that is realistic for the agent's vertical and includes scenarios that test the specific fields the agent needs to collect and the qualification/disqualification rules it must follow. This ensures the teacher's challenges are relevant -- not random.

The briefing is lightweight (~200 tokens) and cached in component state, so it does not slow down the call initiation flow. The call starts immediately while the briefing request runs in parallel.
