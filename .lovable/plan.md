

# Add Pricing Controls to UI

## Problem
The `cost_multiplier` and `monthly_base_fee_usd` columns now exist on `organizations`, but there's no way to view or edit them in the app. Customers can't see their effective rate, and super admins can't override pricing for enterprise deals.

## Two surfaces to update

### 1. Customer-facing rate display (`src/pages/BillingPage.tsx`)
Add a small "Your rate" card next to the balance, showing the effective per-minute price. Read-only for customers.

- Fetches `cost_multiplier` and `monthly_base_fee_usd` along with `credits_balance`.
- Displays:
  - **Effective rate**: `$0.245/min` (computed as `0.153 × cost_multiplier`)
  - **Monthly base fee**: only shown if `> 0` (e.g. "$99/mo")
- One-line explainer: *"Includes telephony, AI voice, and platform — no per-call fees."*

### 2. Super-admin pricing override (`src/pages/AdminCompanyDetailPage.tsx`)
Add a "Pricing" section to the Org Details card with two editable inputs (super_admin only):

- **Cost Multiplier** — numeric input, default 1.6, shows live preview of effective $/min
- **Monthly Base Fee (USD)** — numeric input, default 0
- Save button writes both via a single `update` on `organizations`
- Visible only when `isSuperAdmin === true` (read from `useOrgContext`)
- Displays current vs. new effective rate inline so the admin sees the impact before saving

## Layout sketch (admin page)

```text
┌─ Org Details ────────────────────────────────┐
│ Company Name: [______]   Balance: $889.84    │
│                                              │
│ ── Pricing (super admin only) ──             │
│ Multiplier: [1.6 ]  → Effective $0.245/min   │
│ Monthly base: [0   ] USD                     │
│ [Save Pricing]                               │
│                                              │
│ [Agents] [Campaigns] [Calls]                 │
└──────────────────────────────────────────────┘
```

## Files to change

- `src/pages/BillingPage.tsx` — add read-only "Your rate" card; extend the org SELECT to include the two new columns
- `src/pages/AdminCompanyDetailPage.tsx` — add editable pricing section gated by `isSuperAdmin`; extend the org SELECT and add a save handler

## What I'm NOT changing

- Database schema (already done)
- Webhook/billing logic in `receive-retell-webhook` and `backfill-call-costs` (already applies multiplier)
- The `cost_multiplier` default of 1.6 stays as-is
- No new tiers, no preset buttons — just raw numeric controls so you can dial in any value per org

## Expected outcome

- Customers see their per-minute rate on the Billing page
- Super admins can change a single org's pricing in seconds without a migration or DB tool
- All existing orgs continue at the 1.6× default until you override them

