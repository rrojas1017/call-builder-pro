

## Rebrand to "Appendify Voz" with Orange Color Scheme

### Overview
Replace the current teal/cyan "VoiceForge" branding with an orange-based "Appendify Voz" identity. The uploaded logo (orange triangle/paperclip mark) will be used as the app icon/favicon. The entire color scheme shifts from teal (hsl 172) to a warm orange palette.

### Color Palette (New)
- **Primary**: Orange ~`24 85% 50%` (matching the logo's #E8611A tone)
- **Primary foreground**: White `0 0% 100%`
- **Accent**: Deep orange tint `24 50% 18%`
- **Accent foreground**: Light orange `24 60% 70%`
- **Ring**: Orange (same as primary)
- **Sidebar primary/ring**: Orange
- **Success/Warning**: Kept as-is (green/yellow)
- **Gradient**: Orange to amber instead of teal to blue
- All other dark-mode background, card, border, muted values stay the same (dark navy/slate theme)

### Files to Change

**1. `src/index.css`** -- CSS Variables
- Update `--primary` from `172 66% 50%` to `24 85% 50%`
- Update `--accent` from `172 50% 20%` to `24 50% 18%`
- Update `--accent-foreground` from `172 66% 70%` to `24 60% 70%`
- Update `--ring` to match new primary
- Update all `--sidebar-primary` and `--sidebar-ring` to orange
- Update `.text-gradient-primary` gradient from teal to orange/amber
- Update `.glow-primary` box-shadow from teal hue to orange hue

**2. Logo Asset**
- Copy `user-uploads://Asset_15.png` to `src/assets/appendify-logo.png`
- Copy `user-uploads://Asset_15.png` to `public/favicon.png`
- Update `index.html` favicon to reference `/favicon.png`

**3. `src/components/AppSidebar.tsx`** -- Sidebar branding
- Replace `Zap` icon with an `<img>` tag using the Appendify logo
- Change "VoiceForge" text to "Appendify Voz"

**4. `src/pages/LandingPage.tsx`** -- Landing page branding
- Replace all "VoiceForge" text with "Appendify Voz"
- Replace `Zap` icon in navbar, footer with the Appendify logo image
- Update FAQ answer mentioning "VoiceForge" to "Appendify Voz"
- Update copyright footer text
- Update guarantee section text references

**5. `src/pages/AuthPage.tsx`** -- Auth page branding
- Replace `Zap` icon with Appendify logo image
- Replace all "VoiceForge" text with "Appendify Voz"

**6. `index.html`**
- Update `<title>` to "Appendify Voz"
- Update favicon link to `/favicon.png`

### What Stays the Same
- Dark background theme (navy/slate)
- All layout, spacing, and component structure
- All functionality, routing, and backend integration
- Typography (Inter + JetBrains Mono)

