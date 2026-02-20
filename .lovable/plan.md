
# Super Admin: Create Users with Full Role Selection (Including super_admin)

## What's Missing

The backend is already well-built:
- `create-user` edge function: already allows super_admins to create users in any org with any role
- `manage_team_member_role` RPC: already allows super_admins to assign `super_admin` role
- `AdminCompanyDetailPage`: already has an "Add User" dialog per-company

The gaps are purely in the UI:

1. **Role dropdowns never show `super_admin`** — In `AdminCompanyDetailPage` and `CreateUserDialog`, the `<SelectContent>` only lists `admin`, `analyst`, `viewer`. A super_admin creating another super_admin has no way to select that role.

2. **The Team page `CreateUserDialog` always passes `orgId` from the current active org** — this works fine for same-org creation, but super_admins should be able to select which org the user belongs to when creating from a cross-org context.

3. **The role change dropdown in the members table** (`TeamPage` and `AdminCompanyDetailPage`) never shows `super_admin` as a selectable option for existing members, even when the logged-in user is a super_admin.

---

## What We'll Fix

### Fix 1 — Add `super_admin` to the role selector in `CreateUserDialog`

In `src/components/CreateUserDialog.tsx`, when the creator is a super_admin, add `super_admin` as a selectable role option. We need to pass a `isSuperAdmin` prop (or detect it inside the component using `useOrgContext`).

**Before:**
```
<SelectItem value="admin">Admin</SelectItem>
<SelectItem value="analyst">Analyst</SelectItem>
<SelectItem value="viewer">Viewer</SelectItem>
```

**After (when caller is super_admin):**
```
<SelectItem value="super_admin">Super Admin</SelectItem>
<SelectItem value="admin">Admin</SelectItem>
<SelectItem value="analyst">Analyst</SelectItem>
<SelectItem value="viewer">Viewer</SelectItem>
```

### Fix 2 — Add `super_admin` to the role dropdown in `AdminCompanyDetailPage`

The "Add User" dialog in `AdminCompanyDetailPage` hardcodes the same 3 roles. Add `super_admin` as a top option since this page is exclusively accessible to super_admins.

### Fix 3 — Add `super_admin` to the role change dropdown for existing members (both pages)

In `TeamPage` (the role `<Select>` per member row) and `AdminCompanyDetailPage` (same), when the currently logged-in user `isSuperAdmin`, show `super_admin` as a selectable role in the dropdown so existing users can be promoted.

---

## Files to Change

| File | Change |
|------|--------|
| `src/components/CreateUserDialog.tsx` | Read `isSuperAdmin` from `useOrgContext`; conditionally show `super_admin` role option |
| `src/pages/AdminCompanyDetailPage.tsx` | Add `super_admin` option to both the "Add User" dialog role selector and the per-member role change selector |
| `src/pages/TeamPage.tsx` | Read `isSuperAdmin` from `useOrgContext`; show `super_admin` option in per-member role change selector |

No backend changes needed — the `create-user` function and `manage_team_member_role` RPC already handle super_admin role assignment correctly and securely (server-side role check is enforced in both).

---

## Security Notes

- The super_admin option is only shown in the UI when the caller's role is `super_admin` — it is decorative gating only
- True security enforcement is server-side: `manage_team_member_role` rejects `super_admin` role assignments from non-super_admins with: `"Only super_admins can assign super_admin role"`
- `create-user` edge function likewise validates at the server level — no client-side bypass is possible
