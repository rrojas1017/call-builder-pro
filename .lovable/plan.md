

## Add Back Navigation to Auth Page

### Problem
Users on the `/auth` page have no obvious way to navigate back to the landing page. The logo links to `/` but isn't clearly a navigation element.

### Solution
Add a visible "Back to Home" link/button at the top of the auth page.

### Changes

#### `src/pages/AuthPage.tsx`
- Add an arrow-left icon link at the top-left corner of the right panel (and mobile view) that says "Back to home" and links to `/`
- Uses the `ArrowLeft` icon from lucide-react for clear visual affordance
- Styled subtly with `text-muted-foreground` so it doesn't compete with the form

### Technical Details
- Import `ArrowLeft` from `lucide-react`
- Add a `Link` component pointing to `/` positioned above the form card
- Works on both desktop and mobile layouts
