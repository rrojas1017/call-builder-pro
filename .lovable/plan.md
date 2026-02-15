

## Two Fixes: Toast Auto-Dismiss + Super Admin Sidebar Ordering

---

### Fix 1: Toast Stays on Screen Too Long

**Problem**: The `TOAST_REMOVE_DELAY` in `src/hooks/use-toast.ts` is set to `1,000,000` milliseconds (over 16 minutes). This is why every toast sticks on screen seemingly forever after campaign actions.

The "delay" before the toast appears on start/stop actions is normal -- those invoke backend functions that take a couple seconds. But once the toast shows, it should disappear after a few seconds.

**Fix**: Change `TOAST_REMOVE_DELAY` from `1000000` to `5000` (5 seconds). This is a one-line change in `src/hooks/use-toast.ts` line 6. All toasts across the entire app will now auto-dismiss after 5 seconds.

---

### Fix 2: Super Admin Sidebar Reordering

**What it does**: Super admins get a "Customize Navigation" mode (toggle via a small edit icon in the sidebar). In this mode, sections and items within sections become draggable. Once rearranged, the super admin saves the order, and it becomes the **global default** for all users across all companies.

**How it works**:

1. **New database table**: `sidebar_config` -- a single-row table storing the ordered navigation structure as a JSON column. No per-user or per-org rows, just one global config row.

2. **Sidebar reads from DB on load**: `AppSidebar` fetches `sidebar_config` on mount. If a config exists, it uses that order. If not (first time), it falls back to the current hardcoded default. This means existing navigation works exactly as-is until a super admin makes a change.

3. **Drag-and-drop editing** (super admin only): A small pencil/edit icon appears in the sidebar header for super admins. Clicking it enters "edit mode" where:
   - Sections can be dragged up/down to reorder
   - Items within a section can be dragged to reorder
   - Items can be dragged between sections
   - A Save button persists the new order to `sidebar_config`
   - A Cancel button discards changes

4. **No routes, permissions, or logic changes**: The reordering only affects display order. All paths, icons, labels, and role-based visibility (admin section only for super admins) remain exactly as they are today. The config stores `{ sections: [{ label, items: [{ label, path }] }] }` -- just the ordering. Icons are mapped by path at render time.

**Safety guarantees**:
- The ADMIN section remains super-admin-only regardless of where it's positioned
- All existing routes, components, and RLS policies are untouched
- If the config row is deleted or corrupted, the sidebar falls back to the hardcoded default
- Regular users and admins see the reordered sidebar but cannot edit it

### Technical Details

**Database migration**:
```sql
CREATE TABLE public.sidebar_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sections jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sidebar_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can read sidebar config"
  ON public.sidebar_config FOR SELECT
  TO authenticated USING (true);

-- Only super_admins can modify
CREATE POLICY "Super admins can manage sidebar config"
  ON public.sidebar_config FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
```

**Files changed**:

| File | Change |
|---|---|
| `src/hooks/use-toast.ts` | Change `TOAST_REMOVE_DELAY` from `1000000` to `5000` |
| `src/hooks/useSidebarConfig.ts` | New hook -- fetches sidebar config from DB, falls back to hardcoded default, provides save function |
| `src/components/AppSidebar.tsx` | Use `useSidebarConfig` for section ordering; add edit mode toggle for super admins with drag-and-drop using HTML5 drag API (no new dependencies); map stored paths back to icons at render time |

**Icon mapping strategy**: The hardcoded `navSections` array becomes a lookup map `{ "/dashboard": { icon: LayoutDashboard, label: "Dashboard" }, ... }`. The DB config stores only `[{ label: "BUILD", items: [{ path: "/dashboard" }, ...] }]`. At render time, each path is resolved against the icon map. If a path isn't found (edge case), it's skipped gracefully.

