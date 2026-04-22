

# Add Public Pricing Section to Landing Page

## Problem
You're viewing the public marketing site (`/#how-it-works`) and there's **no pricing visible anywhere**. The pricing UI we built earlier lives inside the authenticated app at `/billing` — invisible to prospects who haven't signed up yet.

The landing nav only shows: Guarantee · Features · How It Works · FAQ. No "Pricing" link, no pricing cards.

## What I'll add

### 1. New `#pricing` section on `LandingPage.tsx`
Three-tier pricing matrix matching the strategy we approved earlier, placed between **Features** and **Smart Transfer callout**:

```text
┌───────────────────────────────────────────────────────────────┐
│           Simple, transparent pricing                         │
│      Pay only for what you use. No hidden fees.               │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  STARTER    │  │  PRO ★      │  │ ENTERPRISE  │            │
│  │             │  │ Most popular│  │             │            │
│  │  $0.25/min  │  │  $0.20/min  │  │  $0.15/min  │            │
│  │             │  │ + $99/mo    │  │ + $499+/mo  │            │
│  │             │  │             │  │             │            │
│  │ ✓ Standard  │  │ ✓ Everything│  │ ✓ Everything│            │
│  │ ✓ 1 campaign│  │ ✓ HIPAA     │  │ ✓ White-label│           │
│  │ ✓ Analytics │  │ ✓ Multi-agt │  │ ✓ Dedicated  │           │
│  │ ✓ Email sup │  │ ✓ Priority  │  │ ✓ Custom SLA │           │
│  │             │  │             │  │             │            │
│  │ [Start free]│  │ [Start free]│  │ [Contact us] │           │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                               │
│  Compare to: Human BPO agent $0.40–$1.50/min                  │
└───────────────────────────────────────────────────────────────┘
```

Visual treatment:
- Three glass-card columns matching existing landing-page style
- Pro tier highlighted with primary-colored border + "Most popular" badge
- Each card: tier name, price (large), feature checklist, CTA button
- Starter / Pro CTAs link to `/auth`; Enterprise links to `mailto:` or `/auth`
- Subtle "Compare to" footnote anchoring against human-agent cost

### 2. Add "Pricing" to nav
- Update `navLinks` array (line 134) → `["Guarantee", "Features", "Pricing", "How It Works", "FAQ"]`
- Anchor scrolls smoothly to new `#pricing` section
- Works on both desktop nav and mobile menu (already maps from the same array)

## Files to change
- `src/pages/LandingPage.tsx` — add pricing section + nav entry

## What I'm NOT changing
- The in-app `/billing` page (already shows the customer's effective rate correctly)
- The admin pricing override on `AdminCompanyDetailPage.tsx` (already works)
- The pricing values themselves (Starter $0.25, Pro $0.20+$99, Enterprise $0.15+$499) — these are the numbers we already approved
- No new database fields, no new edge functions

## Expected outcome
- Visitors to `aivoz.app` see a clear pricing matrix before signing up
- "Pricing" appears in the top nav, scrolls to the new section
- Mobile nav picks it up automatically (same `navLinks` array)
- Matches the visual language of existing landing-page sections (glass cards, fade-up motion, primary accent)

