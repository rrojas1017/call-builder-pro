

## Modernize Landing Page and Auth Page Design

### The Problem
The current design uses a generic dark SaaS template look -- small text, tightly packed sections, basic gradient orbs, and low visual contrast between sections. Retell AI's design succeeds because of bold typography, generous whitespace, clean light/dark section contrast, and polished card layouts.

### Design Direction
Keep the dark theme (it works well with the orange Appendify brand) but modernize it with these principles inspired by Retell:
- Much larger, bolder hero typography (7xl+)
- More generous section padding and whitespace
- Cleaner card designs with subtle glassmorphism
- A "badge" pill above the hero headline (e.g. "#1 AI Voice Agent Platform")
- Better visual hierarchy with section subtitles using a different weight/style
- Smoother, more subtle animations
- A more polished navbar with a pill-shaped CTA button
- Modernized auth page with cleaner form styling

### Changes

**1. Landing Page (`src/pages/LandingPage.tsx`) -- Full Redesign**

Hero Section:
- Add a small animated badge/pill above the headline (e.g. "Trusted by 500+ businesses")
- Increase headline to `text-5xl sm:text-6xl lg:text-7xl` with tighter letter-spacing
- Use a serif or display-style weight contrast ("Sound Human" in gradient stays)
- More vertical padding (`pt-40 pb-24 sm:pt-48 sm:pb-32`)
- Replace the basic gradient orb with a more sophisticated multi-layer gradient background

Navbar:
- Add `rounded-full` pill styling to the "Get Started Free" button
- Increase navbar height to `h-18` for more breathing room
- Add a subtle separator dot between nav links

Guarantee Section:
- Larger card with more internal padding (`p-12 sm:p-16`)
- Add a subtle gradient border effect instead of flat `surface-elevated`

Metrics Section:
- Larger numbers (`text-4xl sm:text-5xl`)
- Add a subtle animated count-up feel with stagger animations

How It Works:
- Use numbered step indicators with a connecting line/dots between cards
- Larger card padding and more prominent step numbers

Features Grid:
- Increase card size with more padding (`p-8`)
- Add a subtle hover lift effect (`hover:-translate-y-1`)
- Make icons slightly larger

Smart Transfer:
- Add a decorative visual element (gradient line or abstract shape)

FAQ:
- Larger accordion items with more padding
- Slightly larger text

CTA Banner:
- Add a gradient background card instead of plain text
- Make it feel more like a standalone "closing" section

Footer:
- Add more links (Privacy, Terms, Contact) and social placeholders
- Better spacing

**2. Auth Page (`src/pages/AuthPage.tsx`) -- Polish**
- Cleaner left panel with a larger, bolder headline
- Add a subtle pattern or mesh gradient to the left panel background
- More refined form inputs with slightly more padding
- Add a subtle card wrapper around the form with rounded corners
- Improve the toggle between login/signup with a smoother transition

**3. CSS Updates (`src/index.css`)**
- Add a new `.glass-card` utility for glassmorphism effect
- Add a `.gradient-border` utility for gradient borders on cards
- Refine `.surface-elevated` to have more polish
- Add subtle hover animation utilities

### What Stays the Same
- All content/copy (headlines, descriptions, FAQs, features)
- Orange color scheme and Appendify branding
- Dark theme foundation
- All routing and functionality
- Sidebar and dashboard (only landing + auth affected)
- Mobile responsiveness (improved, not removed)

### Files Modified
1. `src/pages/LandingPage.tsx` -- Layout, spacing, typography, and visual polish
2. `src/pages/AuthPage.tsx` -- Form styling and left panel refinement
3. `src/index.css` -- New utility classes for glass effects and gradient borders

