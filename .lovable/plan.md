

## Improve US Map to Use Realistic State Boundaries

### Problem
The current `USMapChart` uses manually drawn simplified polygons for each state, resulting in blocky, unrealistic shapes that don't resemble a real US map.

### Solution
Replace the simplified `STATE_PATHS` data in `src/components/USMapChart.tsx` with accurate SVG path data sourced from a standard US states SVG dataset (based on Albion/equal-area projection coordinates commonly used in D3/topojson).

### Changes

**File: `src/components/USMapChart.tsx`**

1. Replace all 51 entries in `STATE_PATHS` with accurate SVG path data and correct centroid coordinates (cx, cy) for each state
2. Adjust the SVG `viewBox` to match the new coordinate system (typically `0 0 960 600` for standard US projections)
3. Reduce stroke width and adjust stroke color for cleaner borders between states
4. Fine-tune the color palette so empty states blend more subtly into the dark background (matching the reference aesthetic)
5. Keep Alaska and Hawaii repositioned in the bottom-left as insets

### Technical Approach
- Use well-known public domain US state boundary SVG paths (Albers USA projection, same as D3's standard)
- Each state entry will have: `d` (SVG path string), `cx`/`cy` (label/dot centroid)
- No new dependencies required -- still pure inline SVG + React
- All existing interactivity (hover, tooltips, color scaling) stays the same

### Visual Improvements
- Realistic state shapes with smooth curves
- Proper proportions and positioning
- Cleaner, thinner border strokes
- Better visual match to the Bland reference map
