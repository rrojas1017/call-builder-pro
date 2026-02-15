

## Add Dark/Light Mode Toggle to the Landing Page

### What Changes
Add a Sun/Moon toggle button to the landing page navbar so visitors can switch between dark and light mode before signing in.

### Changes

| File | What |
|------|------|
| `src/pages/LandingPage.tsx` | Add a theme toggle icon button in the navbar (desktop: next to Sign In, mobile: in the mobile menu) |

### Detail

A small Sun/Moon icon button will be added to the navbar, using the existing `useTheme` hook from `next-themes` (already configured in the app via `ThemeProvider`).

- **Desktop**: The toggle appears as an icon button between the nav links and the "Sign In" button
- **Mobile**: The toggle appears at the top of the mobile dropdown menu
- The button shows a Sun icon in dark mode and a Moon icon in light mode
- Since the entire app is already wrapped in `ThemeProvider` with dark mode support, all landing page elements will automatically adapt -- no CSS changes needed

