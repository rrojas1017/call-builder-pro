

## Set rrojas@vixicom.com as Super Admin

A single database update to change Ramon Rojas's role from `admin` to `super_admin` in the `user_roles` table.

### What changes
- Update the `user_roles` row for user `3f7c86d6-2583-4b1e-adc8-0e35842ee95f` to set `role = 'super_admin'`

### Technical detail
```sql
UPDATE user_roles 
SET role = 'super_admin' 
WHERE user_id = '3f7c86d6-2583-4b1e-adc8-0e35842ee95f';
```

This gives Ramon Rojas elevated privileges across the platform, including the ability to assign the `super_admin` role to others (per the `manage_team_member_role` function logic).

### No code changes needed
This is a data-only change -- no files are created or modified.

