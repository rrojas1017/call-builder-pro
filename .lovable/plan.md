
# Fix: Route Inbound Number Assignment by Provider (Retell vs Bland)

## Problem
When assigning an agent to inbound number `+17866997885`, the `manage-inbound-numbers` function always calls Bland's API. This number was purchased through Retell ($2/mo, labeled "Retell 786"), so Bland rejects it with "No inbound number found."

## Solution
Detect whether an inbound number is a Retell number (by `monthly_cost_usd = 2` or label prefix) and route the assign/unassign actions to the correct provider API.

## Detection Strategy
Retell-purchased numbers have `monthly_cost_usd = 2` (vs $15 for Bland). This is the most reliable discriminator since it's set at purchase time. We'll add a simple check in the assign and unassign actions.

## Changes

**File:** `supabase/functions/manage-inbound-numbers/index.ts`

### Assign Action
After fetching the number from DB, check if it's a Retell number. If so:
1. Look up the agent spec's `retell_agent_id`
2. Call Retell's `PATCH /update-phone-number/{phone_number}` with `inbound_agent_id` set to the Retell agent ID
3. Skip the Bland configuration entirely

If it's a Bland number, keep the existing Bland flow unchanged.

### Unassign Action
Same detection: if Retell number, call Retell's `PATCH /update-phone-number/{phone_number}` to clear the `inbound_agent_id`. If Bland, keep existing flow.

### Technical Detail

```text
// In "assign" action, after fetching num from DB:
const isRetell = num.monthly_cost_usd === 2;

if (isRetell) {
  // Get retell_agent_id from the agent spec
  const spec = await supabase.from("agent_specs").select("retell_agent_id")
    .eq("project_id", project_id).single();
  if (!spec.data?.retell_agent_id) throw new Error("Agent has no Retell ID");

  // Assign via Retell API
  await fetch(RETELL_BASE + "/update-phone-number/" + encodeURIComponent(num.phone_number), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + RETELL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ inbound_agent_id: spec.data.retell_agent_id }),
  });
  // Update DB
  await supabase.from("inbound_numbers").update({ project_id }).eq("id", number_id);
} else {
  // Existing Bland flow (unchanged)
}
```

### Unassign for Retell
```text
if (isRetell) {
  await fetch(RETELL_BASE + "/update-phone-number/" + encodeURIComponent(num.phone_number), {
    method: "PATCH",
    headers: { Authorization: "Bearer " + RETELL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ inbound_agent_id: null }),
  });
  await supabase.from("inbound_numbers").update({ project_id: null }).eq("id", number_id);
}
```

## Files Modified
- `supabase/functions/manage-inbound-numbers/index.ts` -- add Retell API routing in assign and unassign actions

## No Other Changes Needed
- The frontend (`InboundNumbersPage.tsx`) already calls `manage-inbound-numbers` for assign/unassign -- no changes needed there
- The `manage-retell-numbers` function stays as-is (used only for purchase/release)
