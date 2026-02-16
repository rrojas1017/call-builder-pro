

## Add Privacy Policy and Terms of Service Pages

### Overview
Create Privacy Policy and Terms of Service pages for the app, which are required by Google's OAuth consent screen. Once deployed, you can paste the URLs into the Google Cloud Console fields.

### Changes

#### 1. Create `/privacy` route — `src/pages/PrivacyPolicyPage.tsx`
- A simple, styled page with standard privacy policy content for "Appendify Voz" / "aivoz.io"
- Includes sections: data collection, usage, storage, third-party services, contact info
- Placeholder text that can be customized later

#### 2. Create `/terms` route — `src/pages/TermsOfServicePage.tsx`
- A simple, styled page with standard terms of service content
- Includes sections: acceptance, usage rights, limitations, termination, contact info
- Placeholder text that can be customized later

#### 3. Update `src/App.tsx` — Add routes
- Add `/privacy` and `/terms` as public routes

#### 4. Update `src/pages/AuthPage.tsx` — Add footer links
- Add small "Privacy Policy" and "Terms of Service" links at the bottom of the auth card

### After Deployment
Once published, paste these URLs into the Google Cloud Console:
- **Privacy Policy**: `https://aivoz.io/privacy` (or your lovable.app URL)
- **Terms of Service**: `https://aivoz.io/terms`

### Technical Details
- Pages are public (no auth required)
- Styled consistently with existing app design (dark/light mode support)
- Uses existing layout patterns and Tailwind classes

