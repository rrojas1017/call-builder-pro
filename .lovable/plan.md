
## Add Smooth Scroll-Triggered Number Counting Animations to Metrics Section

### Overview
The metrics section currently displays static values (e.g., "10,000+", "95%") with simple fade-in animations. We'll enhance it with smooth number counting animations that trigger when the section scrolls into view, creating an engaging visual effect.

### Design Approach

**Key Features:**
- Numbers will animate from 0 to their final values when the metrics section comes into view
- Smooth easing function for natural motion (using `ease-out` cubic bezier)
- Staggered animations so each metric animates in sequence
- Works with both numeric and non-numeric values (e.g., "10,000+", "<1s", "95%")

### Technical Implementation

**1. Create a New Custom Hook (`src/hooks/useCountUp.ts`)**
- Build a `useCountUp` hook that:
  - Takes a target value string (e.g., "10,000+", "95%")
  - Extracts the numeric part (e.g., 10000, 95, 1)
  - Uses `useEffect` with `useRef` to animate from 0 to the target
  - Integrates with framer-motion's `useMotionValue` for smooth animation
  - Handles edge cases (values with symbols like "+", "%", "<", etc.)
  - Returns the animated display value
- Duration: ~1.5 seconds per count (adjustable)
- Easing: cubic-bezier(0.25, 0.46, 0.45, 0.94) (matching existing fadeUp)

**2. Update Metrics Section (`src/pages/LandingPage.tsx`)**
- Import the new `useCountUp` hook
- Wrap each metric number in a component that uses the hook
- Keep the existing fadeUp animation for the container
- Add a small additional delay per metric so they count sequentially
- Structure:
  ```
  <motion.div ... variants={fadeUp}>
    <MetricNumber value="10,000+" />  {/* counts from 0 to 10000 with + suffix */}
    <div>{label}</div>
  </motion.div>
  ```

**3. Implementation Details**

**MetricNumber Component** (inline or separate):
- Accepts `value` prop (string like "10,000+", "95%", etc.)
- Uses regex to separate number from non-numeric suffix/prefix (e.g., "10,000" from "+", "95" from "%")
- Uses `useCountUp` to get animated value
- Applies custom formatting to match original (e.g., add commas back to "10,000")
- Renders as `<motion.div>` with text animation

**useCountUp Hook Logic**:
- Extract numeric base: "10,000+" → 10000, "95%" → 95, "<1s" → 1
- Use `useMotionValue` from framer-motion for smooth animation
- Create animate effect that counts from 0 to target over 1.5s
- Format the output to match the original (e.g., add thousands separators, preserve suffix)
- Return display value that updates in real-time

### Animation Sequence
1. Metrics section scrolls into view
2. All metrics fade up (existing `fadeUp` animation)
3. Numbers begin counting simultaneously
4. Each metric has a small stagger delay (e.g., 100ms between each) for visual interest
5. Numbers reach their final values and hold

### What Stays the Same
- All existing metrics data and labels
- Overall metrics section layout and styling
- Color scheme and typography
- Mobile responsive design
- Border and spacing

### Files to Create/Modify
1. **Create**: `src/hooks/useCountUp.ts` - Custom hook for number counting logic
2. **Modify**: `src/pages/LandingPage.tsx` - Update metrics rendering to use the hook and add MetricNumber component

### Benefits
- More engaging, dynamic landing page
- Draws attention to impressive metrics
- Professional, modern feel (similar to Retell AI)
- Smooth performance using framer-motion's optimized animation API
- No additional heavy dependencies needed
