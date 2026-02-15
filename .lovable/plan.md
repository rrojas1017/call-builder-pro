

## Promote Bryan Contreras to Super Admin and Fix His Account

### What Changes

1. **Fix email**: Update Bryan's auth email from `bcontrereas@appendify.io` to `bcontreras@appendify.io`
2. **Promote to super_admin**: Change his role from `admin` to `super_admin`
3. **Reset password**: Set a new password via an Edge Function call (you'll tell me the password after approving)

### How

All three changes will be done through a small Edge Function that uses the service role to:
- Update Bryan's email in the auth system
- Update his role in the `user_roles` table
- Reset his password

| Step | Action |
|------|--------|
| 1 | Create a one-time Edge Function `admin-fix-user` that takes the new password, fixes the email, updates the role, and resets the password |
| 2 | Call the function with the desired password |
| 3 | Delete the Edge Function after use (it's a one-time admin operation) |

### Security Note

- Bryan will be able to create other super admins once promoted (the `create-user` Edge Function already allows super admins to assign any role)
- Password-less login is NOT implemented as it would be a critical security vulnerability
- The temporary Edge Function will be removed after the fix is applied

### After Approval

I will ask you for the password you want to set for Bryan before executing.

