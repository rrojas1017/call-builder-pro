

## Add Google Login

### Overview
Add a "Sign in with Google" button to the login page using Lovable Cloud's managed Google OAuth, which works out of the box with no extra configuration needed.

### Changes

#### 1. Configure Social Auth
Use Lovable Cloud's social auth configuration tool to generate the required `src/integrations/lovable/` module and install the `@lovable.dev/cloud-auth-js` package.

#### 2. Update AuthPage.tsx
- Import `lovable` from `@/integrations/lovable/index`
- Add a "Sign in with Google" button above or below the existing email/password form
- The button calls `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
- Add a visual divider ("or") between the Google button and the email form
- Style the button to match the existing design (full width, rounded, with a Google icon)

### Technical Details

- No API keys or secrets are needed -- Lovable Cloud provides managed Google OAuth credentials automatically
- The Google button will be available on both login and signup views
- After successful Google sign-in, the existing `handle_new_user` trigger will automatically create the user's profile and organization, just like email signup

