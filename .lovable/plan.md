

## Show User Role in Sidebar

Add a role badge to the bottom of the sidebar so every logged-in user can see their current role (e.g., super_admin, admin, analyst, viewer).

### What changes

**File: `src/components/AppSidebar.tsx`**

1. Import `useUserRole` from `@/hooks/useUserRole` and import the `Badge` component from `@/components/ui/badge`.
2. Inside the component, call `const { role } = useUserRole();`.
3. In the bottom footer section (lines 238-247), add a role display row above the ThemeToggle, showing:
   - A `Shield` icon (from lucide-react)
   - The role as a styled Badge with a human-friendly label (e.g., "Super Admin", "Admin", "Analyst", "Viewer")
   - A subtle, non-interactive row matching the existing sidebar style

### Visual result

```text
---------------------
| Shield  Super Admin |   <-- new row with badge
| Theme Toggle        |
| Sign Out            |
---------------------
```

### Technical details

- Use a small helper to format the role string: `super_admin` becomes "Super Admin", `admin` becomes "Admin", etc.
- Badge variant mirrors the logic already in `TeamPage.tsx`: destructive for super_admin, default for admin, secondary for analyst, outline for viewer.
- The `useUserRole` hook already exists and fetches from the `user_roles` table, so no new queries or backend changes are needed.

