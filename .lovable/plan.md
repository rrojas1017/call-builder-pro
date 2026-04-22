

# Competitive Pricing Recommendation

## Your cost basis (verified)
- Wholesale (Retell + telephony + LLM): **$0.153/min**
- Currently charging: **$0.153/min** → **$0 margin**

## What competitors charge (retail per minute)

| Platform | Retail $/min | Notes |
|---|---|---|
| Retell AI (direct) | $0.07–$0.10 | Their published wholesale-style rate |
| Vapi AI | $0.14–$0.18 | Modular fees stack up |
| Twilio Voice (DIY) | $0.14 | Requires dev work |
| Bland AI | $0.09–$0.12 | Volume tiers |
| Synthflow | $0.13–$0.20 | No-code tier |
| Air AI / Euphonia | $0.35–$0.65 | Premium / managed |
| Human BPO agent | $0.40–$1.50 | The real comparison for your buyers |

Most no-code / managed platforms (your category) sit at **$0.20–$0.35/min**. Anything below $0.15 is bare wholesale; anything above $0.40 is premium-managed.

## Recommended pricing model for Appendify

Three-tier pricing with a configurable per-org multiplier on wholesale cost:

### Tier 1 — Starter (self-serve)
- **$0.25/min** (~63% gross margin)
- Default for new signups
- Includes: standard agents, 1 campaign, basic analytics
- Positioning: "Half the cost of a human agent"

### Tier 2 — Pro
- **$0.20/min** (~30% margin) + **$99/month base**
- For customers doing 2,000+ min/month
- Includes: HIPAA, multi-agent, priority support
- Base fee guarantees minimum revenue per account

### Tier 3 — Enterprise / White-label
- **$0.15/min** (~negative without base) + **$499–$2,000/month base**
- Volume + white-label brand
- Custom SLA, dedicated number pools

### Add-ons (pure margin)
- Voicemail drop: included
- Phone number: $3/mo (Retell costs $2 → $1 margin)
- Premium voices (ElevenLabs custom clone): +$0.05/min
- HIPAA campaign: +$0.02/min on Starter (free on Pro+)

## Why $0.25/min is the right anchor
- Below Vapi/Synthflow retail → easy "we're cheaper" sales line
- Above Retell direct → buyers who tried Retell and got stuck come to you for the no-code layer
- 63% gross margin covers Stripe fees (2.9% + 30¢), failed-call write-offs, support, and infra
- Round, memorable number for landing page

## Technical implementation
Two small changes to make this configurable instead of hardcoded:

1. **Schema**: add `cost_multiplier numeric default 1.6` and `monthly_base_fee_usd numeric default 0` to `organizations` table.
2. **`receive-retell-webhook/index.ts`** and **`backfill-call-costs/index.ts`** — multiply `combined_cost` by the org's `cost_multiplier` before deducting from `credits_balance` and writing to `credit_transactions`. Show wholesale cost separately in `extracted_data` for audit.
3. **`BillingPage.tsx`** — display effective rate ("$0.25/min") to customers, not the raw wholesale.
4. **Admin UI** (`AdminCompanyDetailPage.tsx`) — let super_admin override `cost_multiplier` per org for enterprise deals.
5. **Monthly base fee** — new edge function `charge-monthly-base` triggered by pg_cron on the 1st of each month, deducts `monthly_base_fee_usd` from `credits_balance`.

## What I'd ship first
Just step 1 + 2 with `cost_multiplier = 1.6` (→ $0.245/min retail). That instantly turns every minute profitable. Tiers, base fees, and the admin override can come in a follow-up.

## Expected outcome
- Gross margin goes from 0% → ~38% on day one
- At current 110 min/month per active org you'd net ~$10/org — small now, but scales linearly
- Gives you headroom to offer Stripe top-up bonuses ("Top up $250, get $275 in credits") as a growth lever

