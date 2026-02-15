

## Rename "Gym" to "University"

Rebrand the testing environment from "Gym" to "University" to align with the graduation/maturity system. This is a cosmetic rename across UI labels, page titles, and marketing copy -- no logic or route changes needed.

### Changes

| File | What Changes |
|---|---|
| `src/pages/GymPage.tsx` | Rename file to `UniversityPage.tsx`. Change heading from "Gym" to "University". Update subtitle to reference training/graduating. Change internal test labels from "Gym Test" to "University Test". |
| `src/App.tsx` | Update import from `GymPage` to `UniversityPage`. Route `/test` stays the same (no URL break). |
| `src/components/AppSidebar.tsx` | Change sidebar label from "Gym" to "University". Change icon from `Dumbbell` to `GraduationCap`. |
| `src/pages/LandingPage.tsx` | Update 3 references: feature description, FAQ question, and FAQ answer to say "University" instead of "Gym". |

### What Stays the Same

- The `/test` route path remains unchanged (no broken links)
- All internal logic, test run creation, and evaluation flows are untouched
- The `GraduationCap` icon is already imported in other files so it's consistent with the maturity badges

