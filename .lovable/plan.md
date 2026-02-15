

## Execute: Fix Bryan Contreras Account

Now that I have the password, here's exactly what I'll do:

### Step 1: Create temporary Edge Function `admin-fix-user`

This function will use the service role to:
- Look up Bryan by his current email `bcontrereas@appendify.io`
- Update his auth email to `bcontreras@appendify.io`
- Set his password to `Appendify2025!`
- Update his role in `user_roles` to `super_admin`

### Step 2: Deploy and call the function

Invoke the function to apply all three changes at once.

### Step 3: Clean up

Delete the `admin-fix-user` Edge Function since it's a one-time operation.

### Result

Bryan will be able to log in with:
- **Email:** bcontreras@appendify.io
- **Password:** Appendify2025!
- **Role:** super_admin

