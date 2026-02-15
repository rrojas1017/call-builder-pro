

## Add Animated "How It Works" Motion Demo Section

### What Changes
Replace the current static "How It Works" 3-card section with an interactive, animated motion graphics demo that visually walks visitors through the Create -> Train -> Deploy flow. This acts as a "short video" built entirely with Framer Motion animations -- no actual video file needed.

### How It Will Look

The section will feature a central animated "screen" mockup that auto-plays through three scenes in a loop, each showing a simplified UI animation of the step:

1. **Create** -- A text prompt types itself out, an "Agent Name" field fills in, and a "Generate" button pulses
2. **Train** -- Chat bubbles animate in (simulating a test call), a score meter fills up to 95%
3. **Deploy** -- A phone icon rings, a "Campaign Live" badge animates in, and a call counter ticks up

Below the animation, three step indicators (like a timeline/progress bar) highlight the current step and allow manual clicking to jump to a step.

### Changes

| File | What |
|------|------|
| `src/components/AgentDemoAnimation.tsx` | New component: the full animated demo with three scenes, auto-advancing timer, and step indicators |
| `src/pages/LandingPage.tsx` | Import and place the new component inside the "How It Works" section, keeping the existing heading but replacing the 3-card grid with the animation |

### Technical Detail

**AgentDemoAnimation.tsx** will contain:

- A state machine cycling through steps 0/1/2 on a 4-second interval (auto-play with pause on hover)
- Each scene uses Framer Motion `AnimatePresence` for smooth enter/exit transitions
- Scene 1 (Create): A mock input field with a typewriter effect using `motion.span` and staggered letter animation, plus a pulsing "Generate" button
- Scene 2 (Train): Staggered `motion.div` chat bubbles sliding in from left/right, a `motion.div` progress bar that fills to 95%
- Scene 3 (Deploy): A ringing phone icon with a wiggle animation, a "Campaign Live" badge that scales in, and a counting number animation
- Step indicator dots/pills at the bottom with active state highlighting, clickable to jump
- The entire demo sits inside a rounded card with a subtle gradient border (matching existing `gradient-border` class)
- Fully responsive: scales down cleanly on mobile
- Uses only existing dependencies (framer-motion, lucide-react, tailwind)

**LandingPage.tsx** changes:

- Import `AgentDemoAnimation`
- In the "How It Works" section (line ~394), replace the 3-card grid with the animation component
- Keep the section heading and subheading as-is

