
## Rebrand "Quick Test" to "Gym" - Agent Training & Testing Hub

### Overview
The user wants to rename the test/training page from "Quick Test" to "Gym" to better reflect its purpose as an agent training and testing environment.

### Scope of Changes

**Files to update:**

1. **File rename**: `src/pages/QuickTestPage.tsx` → `src/pages/GymPage.tsx`
   - Update export function name from `QuickTestPage` to `GymPage`

2. **src/App.tsx** (import & route)
   - Change import from `QuickTestPage` to `GymPage`
   - Route path remains `/test` (internal routing, don't break existing links)

3. **src/components/AppSidebar.tsx** (navigation label)
   - Change nav label from `"Test"` to `"Gym"`
   - Icon can stay as `FlaskConical` (good metaphor for training/testing)

4. **src/pages/QuickTestPage.tsx** (content text)
   - Page heading: `"Quick Test"` → `"Gym"`
   - Page subtitle: `"Pick an agent, enter a phone number, hit test."` → Something like `"Train and test your agents one-on-one to measure humanness and refine performance."`
   - Chart heading: `"Humanness Score Trend"` → `"Agent Humanness Progress"`
   - Results heading: `"Result"` → Keep as is (already clear)
   - Test run names: `"Quick Test"` → `"Gym Test"` (in the edge function call)

### Benefits
- Better UX language that emphasizes training/learning loop
- Aligns with the system's continuous improvement philosophy
- Makes it clear this is where agents are developed and validated

### Technical Details
- No database changes required
- No route path changes (stays at `/test`)
- All updates are purely cosmetic/labeling
- The `normalizePhone` function and all logic remain unchanged
