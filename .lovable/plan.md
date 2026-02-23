
# Improve Light Mode Contrast Across the App

## Problem
In light mode, cards are invisible because both `--background` and `--card` are pure white (`0 0% 100%`), and `--border` is very faint at 91% lightness. This makes card edges, sections, and UI hierarchy hard to distinguish.

## Solution
Update the light mode CSS variables in `src/index.css` to create clear visual separation between background and cards:

### CSS Variable Changes (`:root` / light mode only)

| Variable | Current | New | Why |
|----------|---------|-----|-----|
| `--background` | `0 0% 100%` (white) | `220 14% 96%` (light gray) | Tinted background so cards pop |
| `--card` | `0 0% 100%` (white) | `0 0% 100%` (stays white) | Cards stay white on gray bg |
| `--border` | `220 13% 91%` | `220 13% 85%` | Darker borders for definition |
| `--input` | `220 13% 91%` | `220 13% 85%` | Match border for consistency |
| `--muted` | `220 14% 96%` | `220 14% 93%` | Slightly darker muted surfaces |
| `--sidebar-background` | `220 14% 97%` | `0 0% 100%` | Keep sidebar crisp white |
| `--sidebar-border` | `220 13% 91%` | `220 13% 85%` | Match stronger borders |

### Utility Class Updates
Also update the `glass-card` utility to use stronger border opacity in light mode by changing the border alpha from `0.5` to `0.8`.

### File Changed

| File | Change |
|------|--------|
| `src/index.css` | Adjust 7 light-mode CSS variable values and tweak glass-card border opacity |

Dark mode values remain untouched -- only the `:root` (light) theme is affected.
