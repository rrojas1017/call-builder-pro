

## Add "10-Minute Guarantee" Section Below the Hero

### Overview
Add a bold, attention-grabbing guarantee section directly below the hero that communicates VoiceForge's core promise: deploy a fully functional AI agent in 10 minutes or get $100 in credit. Includes terms and conditions in a collapsible/expandable format.

### Design
The section will be a centered callout with:
- A prominent tagline: **"The fastest, simplest way to deploy an AI agent"**
- The guarantee: **"If you don't have a fully functional, well-behaved agent in 10 minutes, we'll give you $100 in credit."**
- A subtle timer/clock icon for visual emphasis
- An expandable "Terms & Conditions" accordion below the guarantee text
- Framer-motion fade-up animation consistent with the rest of the page

### Terms & Conditions (expandable)
- "Fully functional" means the agent can hold a natural conversation, follow your script, and handle basic objections as demonstrated in a test call via the Gym.
- The 10-minute clock starts when you begin the agent creation wizard and stops when you run your first successful test call.
- Credit is applied to your VoiceForge account and can be used toward calling minutes.
- Limit one claim per account. Must be a new account created after this promotion launches.
- To claim, contact support with your account email and a screenshot of your wizard start time.

### Technical Details

**File modified: `src/pages/LandingPage.tsx`**

1. Import the `Timer` icon from `lucide-react`
2. Add a new section between the Hero (`</section>`) at ~line 227 and the Metrics section at ~line 230
3. The new section contains:
   - A `motion.div` with `fadeUp` animation
   - Timer icon in a primary-tinted circle
   - Headline and guarantee text
   - A small `Accordion` component (already imported) for terms and conditions
   - Styled with `surface-elevated` card look, max-width constrained, centered
4. Add a "Guarantee" link to the navbar anchoring to `#guarantee`

No new files, no new dependencies, no backend changes needed.
