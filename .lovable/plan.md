

# Cost Tracking and Reporting from Retell

## What This Does
After every call ends, we'll automatically fetch the real cost from Retell's API and save it. Then we'll show a clear cost breakdown on the Billing page so you always know exactly what's costing you.

## How It Works

### 1. Capture Real Costs from Retell (Webhook Update)
When a call ends, the webhook will call Retell's "Get Call" API (`GET /v2/get-call/{call_id}`) to fetch the actual cost breakdown. This returns itemized costs (voice engine, LLM, telephony) and a combined total. We'll save:
- The total cost to the existing `cost_estimate_usd` column on the calls table
- A new credit transaction record deducting that amount from the org's balance
- Decrement the org's `credits_balance` accordingly

### 2. Auto-Deduct Credits After Each Call
Right after saving the cost, the webhook will:
- Insert a `credit_transaction` with type `call_charge` and a negative amount
- Update the org's `credits_balance` by subtracting the call cost
- Include a description like "Call to +1234567890 (3.2 min) - $0.42"

### 3. Cost Reporting on Billing Page
Add a new "Usage Summary" section above the transaction history showing:
- **Total Spend** (sum of all call charges)
- **Total Minutes** used
- **Avg Cost Per Minute** 
- **Calls Made** count
- A period selector (Today / 7 Days / 30 Days / All Time)
- Breakdown table by agent showing minutes and cost per agent

---

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/receive-retell-webhook/index.ts` | After upserting the call, fetch `GET /v2/get-call/{call_id}` from Retell API using `RETELL_API_KEY` to get `call_cost.combined_cost`. Save to `cost_estimate_usd`. Insert credit_transaction and decrement org balance. |
| `src/pages/BillingPage.tsx` | Add usage summary KPI cards (Total Spend, Minutes, Avg $/min, Call Count) with period selector. Add per-agent cost breakdown table. Query data from `calls` table aggregating `cost_estimate_usd` and `duration_seconds`. |

### Retell API Response Structure (call_cost)
```text
call_cost: {
  product_costs: [
    { product: "elevenlabs_tts", cost: 60, unit_price: 1 },
    { product: "openai_llm", cost: 10, unit_price: 0.5 }
  ],
  total_duration_seconds: 60,
  total_duration_unit_price: 1,
  combined_cost: 70  // in cents
}
```

### Credit Deduction Flow
```text
Call Ends (webhook)
  --> Fetch Retell GET /v2/get-call/{call_id}
  --> Extract combined_cost (cents) --> convert to USD
  --> UPDATE calls SET cost_estimate_usd = $X
  --> INSERT credit_transaction (type: call_charge, amount: -$X)
  --> UPDATE organizations SET credits_balance = credits_balance - $X
```

### No New Database Tables Needed
- `cost_estimate_usd` column already exists on `calls`
- `credit_transactions` table already exists
- `credits_balance` column already exists on `organizations`

