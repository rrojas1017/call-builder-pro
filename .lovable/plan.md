

# Webhook Secret Validation for Bland and Retell Webhooks

## Overview

Add shared secret validation to the `receive-bland-webhook` and `receive-retell-webhook` edge functions so that only requests carrying the correct secret are processed. This prevents attackers from injecting fake call data.

## How It Works

1. You generate a random secret string (e.g., 32+ characters)
2. You store that same secret in two places:
   - As a Lovable Cloud secret called `WEBHOOK_SECRET`
   - In the Bland and Retell dashboard webhook configuration as a custom header (`x-webhook-secret`)
3. Each webhook function checks the incoming `x-webhook-secret` header against the stored secret and rejects mismatches with a 401

## Implementation Steps

### Step 1: Add the WEBHOOK_SECRET secret
- Prompt you to enter the secret value you generated

### Step 2: Update `receive-bland-webhook/index.ts`
- At the top of the handler (after CORS/OPTIONS check), read `WEBHOOK_SECRET` from environment
- Compare against `req.headers.get("x-webhook-secret")`
- Return 401 Unauthorized if they don't match
- Sanitize error messages to avoid leaking internal details

### Step 3: Update `receive-retell-webhook/index.ts`
- Same validation logic as the Bland webhook

### Step 4: Update `stop-call/index.ts`
- Sanitize the error response (currently exposes raw error messages)

### Step 5: Mark the security finding as resolved

---

## Technical Details

### Validation code added to each webhook function (after OPTIONS check):

```typescript
const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
if (webhookSecret) {
  const provided = req.headers.get("x-webhook-secret");
  if (provided !== webhookSecret) {
    console.error("Webhook auth failed");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
```

### Error sanitization pattern for all three functions:

```typescript
// Before (leaks internals):
return new Response(JSON.stringify({ error: err.message }), { status: 400 });

// After (generic message):
return new Response(JSON.stringify({ error: "Request failed" }), { status: 400 });
```

### Where to configure the header in provider dashboards:

- **Bland**: Go to your Bland dashboard webhook settings and add a custom header `x-webhook-secret` with your generated secret value
- **Retell**: Go to your Retell dashboard webhook settings and add a custom header `x-webhook-secret` with the same secret value

