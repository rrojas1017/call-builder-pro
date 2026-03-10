

# Modernize University Page Aesthetics

## Current State
The University page uses basic `surface-elevated` cards with flat styling, plain text headers, and uniform rounded-xl containers. It looks functional but lacks visual hierarchy, depth, and polish.

## Design Direction
Apply the same "Modern Dashboard" aesthetic already used elsewhere in the app (mesh gradients, glassmorphism, gradient borders, animated accents) to create a premium, refined feel.

## Changes

### 1. Page Header — Hero Treatment (`UniversityPage.tsx` lines 474-479)
- Replace plain `h1` with `text-gradient-primary` gradient text
- Add a mesh-gradient background behind the header area
- Subtle animated accent line below the title

### 2. Graduation Badge — Premium Card (`UniversityPage.tsx` lines 482-510)
- Switch to `gradient-border` with glassmorphism (`glass-card`)
- Add a subtle glow effect around the level icon
- Animate the progress bar with a shimmer effect
- Larger, bolder level label with gradient text for "Graduated" level

### 3. Summary Stats Row — Glass Cards (`UniversityPage.tsx` lines 512-520, StatCard component lines 721-731)
- Replace `surface-elevated` with `glass-card` + `hover-lift` for interactive feel
- Add a colored accent line at the top of each card matching the stat type
- Make the value use tabular numbers (`font-mono`) for alignment
- Add subtle primary glow on the icon

### 4. Form Section — Cleaner, Tighter (`UniversityPage.tsx` lines 522-582)
- Use `glass-card` instead of `surface-elevated`
- Refined input styling with focus ring animations
- Button gets `glow-primary` on hover

### 5. Trend Chart — Enhanced Container (`UniversityPage.tsx` lines 604-637)
- `gradient-border` wrapper with mesh-gradient background
- Slightly larger chart height (h-56 → h-64)
- Styled legend with small colored dots

### 6. History Table — Sleeker Rows (`UniversityPage.tsx` lines 655-714)
- `glass-card` container
- Alternating row opacity for readability
- Selected row gets a left border accent in primary color
- Hover state with subtle background shift

### 7. Result Card — Premium Evaluation Display (`UniversityPage.tsx` lines 859-1091)
- `gradient-border` wrapper
- Score cards get radial gradient backgrounds matching their color
- Improvement items get left-border severity indicators instead of badges-only

### 8. SimulationTraining Component — Matching Treatment (`SimulationTraining.tsx`)
- Same `glass-card` + `gradient-border` treatment for the main container
- Tab list gets a more refined look with rounded pill indicators
- Progress bar gets shimmer animation during training

### 9. New CSS Utilities (`index.css`)
- Add `@keyframes shimmer` for progress bar animation
- Add `.shimmer-bar` utility class

### Files Changed
- `src/pages/UniversityPage.tsx` — styling updates across all sections and sub-components
- `src/components/SimulationTraining.tsx` — matching card/container styling
- `src/index.css` — shimmer animation keyframes

All changes are purely CSS/className updates. No logic or functionality changes.

