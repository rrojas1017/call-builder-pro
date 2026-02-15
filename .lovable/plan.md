

## Improve US Map Color Contrast

The current map has low contrast because:
1. Empty states use `hsl(var(--muted))` which blends with low-value colored states
2. The lightness range is narrow (45% to 20%) making it hard to distinguish intensity levels
3. State borders use `hsl(var(--border))` which is barely visible in dark mode
4. The bubble overlays at 0.6 opacity muddy the colors further

### Changes in `src/components/USMapChart.tsx`

**1. Wider color range for filled states**
- Change lightness range from `45-20%` to `75-25%` so low-value states are clearly lighter and high-value states are deeply saturated
- Increase saturation scaling so high-value states really pop

**2. Distinct empty state fill**
- Empty states (no data): use a very faint neutral fill with lower opacity instead of `hsl(var(--muted))`, making them clearly "blank"
- In dark mode this means a slightly lighter gray; in light mode a very light gray

**3. Stronger state borders**
- Increase default `strokeWidth` from `0.5` to `0.8`
- Use a slightly more visible border color for states with data vs without

**4. Bolder data bubbles**
- Increase bubble opacity from `0.6` to `0.75`
- Add a subtle white/dark stroke to bubbles so they stand out from the fill

**5. Legend gradient update**
- Update to match the new wider lightness range

### Technical Details

| Line(s) | Change |
|---------|--------|
| 112-118 (`getColorForMetric`) | Widen lightness range to 75%-25%, boost saturation for high values |
| 197 (empty fill) | Use semi-transparent neutral instead of muted |
| 198 (strokeWidth) | Default 0.5 to 0.8 |
| 207 (bubble opacity) | 0.6 to 0.75, add stroke |
| 231-236 (legend gradient) | Match new lightness range |

Only `src/components/USMapChart.tsx` is modified. No other files change.

