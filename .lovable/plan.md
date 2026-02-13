

## Landing Page, Login Page, and Feature Gap Analysis

### Retell AI Website Structure (for design inspiration)

Retell's homepage follows a proven SaaS pattern:
1. **Hero** -- Bold headline + subheadline + CTA buttons ("Try For Free" / "Contact Sales") + live demo link
2. **Logo bar** -- Scrolling marquee of customer logos (social proof)
3. **Product explainer** -- "What is Retell?" section comparing IVR vs IVA vs their LLM-based approach
4. **Live demo widget** -- Interactive "Try Our Live Demo" with call type selection + phone input
5. **Case studies / testimonials** -- Customer quotes with metrics (38% NPS increase, 50% cost reduction, $280K/month collections)
6. **Feature highlights** -- Three sections:
   - Voice quality (lowest latency, ultra-realistic voice, turn-taking)
   - Platform features (agentic framework, function calling, RAG knowledge base)
   - Quality assurance (simulation testing, continuous QA, analytics dashboard)
7. **Omni-channel** -- Voice, Chat, SMS, API channels
8. **Telephony stack** -- Branded caller ID, SIP trunking, batch calling, verified numbers
9. **Security/compliance** -- HIPAA, SOC2, GDPR, SSO, PII redaction, RBAC
10. **Integrations** -- Scrolling logo bar (HubSpot, Twilio, Vonage, GoHighLevel, n8n)
11. **FAQ accordion**
12. **CTA banner** -- Final conversion section
13. **Footer** -- Standard links

---

### Feature Comparison: What VoiceForge Has vs. Retell

| Retell Feature | VoiceForge Status | Notes |
|---|---|---|
| Agent creation wizard | BUILT | 3-step wizard with AI spec generation |
| Outbound calling / campaigns | BUILT | Campaign system with batch calling |
| Inbound call handling | BUILT | Inbound numbers page with agent assignment |
| Voice selection | BUILT | Bland AI voice library integration |
| Knowledge base / RAG | BUILT | Knowledge base page with document upload |
| Call transcripts + recordings | BUILT | Calls page with transcripts |
| Agent testing / simulation | BUILT | Gym page with test runs |
| Call evaluation / scoring | BUILT | AI-powered call evaluation with scores |
| Performance analytics dashboard | BUILT | Dashboard with KPIs, charts, leaderboard |
| Transfer to live agent | BUILT | Transfer phone number configuration |
| Background audio tracks | BUILT | Office, cafe, restaurant options |
| Agent improvement suggestions | BUILT | Research-and-improve edge function |
| Contact list management | BUILT | Lists page with CSV parsing |
| Multi-org support | BUILT | Org-based data isolation |
| Live demo widget on homepage | NOT BUILT | Could build -- trigger a demo call via Bland API |
| Chat / SMS / API channels | NOT BUILT | Would require significant new infrastructure |
| Drag-and-drop call flow builder | NOT BUILT | Complex feature, not trivial |
| CRM integrations (HubSpot, etc.) | NOT BUILT | Could add webhook-based integrations |
| Branded caller ID | NOT BUILT | Bland API may support this |
| SIP trunking | NOT BUILT | Bland-specific telephony |
| SSO / RBAC | NOT BUILT | Could add with auth provider config |
| PII redaction | NOT BUILT | Could add as post-processing step |
| HIPAA/SOC2 compliance badges | NOT BUILT | Operational/legal, not code |
| Public landing page | NOT BUILT | Currently redirects to /dashboard |
| Polished login/signup page | PARTIALLY BUILT | Functional but plain |

### Items That Could Be Easily Built

1. **Public landing page** -- Pure frontend, no backend needed
2. **Polished auth page** -- Redesign existing AuthPage
3. **Live demo widget** -- Reuse existing Bland API call infrastructure
4. **FAQ section** -- Pure frontend component
5. **Webhook/Zapier integrations page** -- Edge function to forward call events

---

### Implementation Plan

This is a large scope. I recommend breaking it into two phases. **Phase 1** covers the landing page and auth page redesign (the immediate ask).

#### Phase 1: Landing Page + Auth Page Redesign

**New files to create:**
- `src/pages/LandingPage.tsx` -- Public homepage

**Files to modify:**
- `src/App.tsx` -- Route `/` to LandingPage instead of redirecting to /dashboard
- `src/pages/AuthPage.tsx` -- Redesign with split layout

---

#### 1. Landing Page (`src/pages/LandingPage.tsx`)

Sections inspired by Retell but adapted for VoiceForge:

**A. Navbar**
- VoiceForge logo + nav links (Features, How It Works, FAQ)
- "Sign In" and "Get Started" buttons
- Sticky, transparent background with blur on scroll

**B. Hero Section**
- Large headline: "AI Voice Agents That Sound Human, Scale Effortlessly"
- Subheadline: "Build, deploy, and manage next-generation AI phone agents. Automate outbound campaigns, handle inbound calls, and qualify leads -- all with natural conversation."
- Two CTAs: "Get Started Free" (primary) + "See How It Works" (ghost)
- Subtle animated gradient orb background (using CSS, no heavy libraries)

**C. How It Works (3-step)**
- Step 1: "Describe Your Agent" -- icon + short description
- Step 2: "AI Builds Your Script" -- icon + short description
- Step 3: "Launch Campaigns" -- icon + short description

**D. Feature Highlights Grid**
Adapted from Retell's feature sections, only showing what VoiceForge actually has:
- "AI-Powered Agent Builder" -- Describe what you need, AI generates the conversation flow
- "Outbound + Inbound" -- Run batch campaigns or handle incoming calls with the same agent
- "Test Before You Launch" -- Gym simulation testing with AI evaluation and scoring
- "Knowledge Base" -- Upload documents so your agent can answer any question
- "Performance Analytics" -- Real-time dashboard with conversion rates, call scores, and trends
- "Smart Call Transfer" -- Automatically transfer qualified leads to your sales team

**E. Metrics / Social Proof Bar**
- Placeholder stats: "10,000+ Calls Handled" / "95% Customer Satisfaction" / "50% Cost Reduction"
- These can be updated with real numbers later

**F. FAQ Accordion**
Using existing Accordion component. Questions adapted from Retell:
- "What is an AI voice agent?"
- "How do I create an agent?"
- "Can I connect my existing phone number?"
- "How does the testing/gym work?"
- "What voices are available?"

**G. CTA Banner**
- "Ready to automate your calls?"
- "Get Started Free" button

**H. Footer**
- VoiceForge logo, copyright, links

---

#### 2. Auth Page Redesign (`src/pages/AuthPage.tsx`)

Current: Centered card on dark background, minimal.

**New design** (inspired by Retell's clean, professional style):
- **Split layout**: Left side = branding panel with gradient background, headline, and 3 value props with icons. Right side = login/signup form.
- Left panel content:
  - VoiceForge logo
  - "Build AI Voice Agents in Minutes"
  - Three bullet points with icons: "Natural conversations", "Scale to thousands of calls", "AI-powered testing and improvement"
- Right panel: Same form logic but with better spacing, larger inputs, and a more polished card container
- Mobile: Stack vertically, hide left panel on small screens

---

#### 3. Routing Update (`src/App.tsx`)

- Change `<Route path="/" element={<Navigate to="/dashboard" replace />} />` to `<Route path="/" element={<LandingPage />} />`
- The ProtectedLayout already redirects unauthenticated users, so logged-in users can still bookmark /dashboard directly

---

### Technical Details

- No new dependencies needed -- using existing Tailwind, Lucide icons, Radix Accordion, framer-motion (already installed)
- Landing page will use framer-motion for subtle scroll animations on feature cards
- All components use the existing dark theme color tokens (--primary teal, --background dark navy)
- Responsive design: mobile-first with breakpoints at sm/md/lg/xl

### What This Does NOT Include (Phase 2 candidates)
- Live demo widget (needs a demo Bland agent + phone input flow)
- Integration logos/partners section (needs actual partner relationships)
- Pricing page
- Chat/SMS channels
- Drag-and-drop call flow builder

