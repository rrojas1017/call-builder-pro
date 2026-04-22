import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Bot,
  PhoneOutgoing,
  PhoneIncoming,
  FlaskConical,
  BookOpen,
  BarChart3,
  PhoneForwarded,
  MessageSquare,
  Rocket,
  Menu,
  X,
  Timer,
  Zap,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { useTheme } from "next-themes";
import appendifyLogo from "@/assets/appendify-logo.png";
import { useCountUp } from "@/hooks/useCountUp";
import AgentDemoAnimation from "@/components/AgentDemoAnimation";

function MetricNumber({ value, delay }: { value: string; delay: number }) {
  const { ref, display } = useCountUp(value, 1.5, delay);
  return (
    <div ref={ref} className="text-4xl sm:text-5xl font-extrabold text-primary tracking-tight">
      {display}
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const features = [
  {
    icon: Bot,
    title: "AI-Powered Agent Builder",
    desc: "Describe what you need in plain English. Our AI generates the full conversation flow, objection handling, and qualification logic.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound Campaigns",
    desc: "Upload contact lists, set concurrency limits, and launch batch calling campaigns that scale to thousands of calls.",
  },
  {
    icon: PhoneIncoming,
    title: "Inbound Call Handling",
    desc: "Assign agents to inbound numbers. Handle customer inquiries, qualify leads, and route calls — 24/7.",
  },
  {
    icon: FlaskConical,
    title: "Test Before You Launch",
    desc: "Run simulated calls in the University. AI evaluates every conversation and scores agent performance before going live.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    desc: "Upload documents, FAQs, and product info. Your agent references them in real-time to answer any question accurately.",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    desc: "Real-time dashboard with conversion rates, call scores, duration trends, and agent leaderboards.",
  },
];

const steps = [
  {
    icon: MessageSquare,
    title: "Describe Your Agent",
    desc: "Tell us your use case, tone, and goals. Our wizard asks the right questions to capture everything.",
  },
  {
    icon: Zap,
    title: "AI Builds Your Script",
    desc: "Our AI generates a complete agent spec — opening lines, qualification rules, objection handling, and more.",
  },
  {
    icon: Rocket,
    title: "Launch & Optimize",
    desc: "Go live with campaigns, monitor performance in real-time, and let AI suggest improvements automatically.",
  },
];

const faqs = [
  {
    q: "What is an AI voice agent?",
    a: "An AI voice agent is a software-powered phone agent that can make and receive calls, hold natural conversations, qualify leads, collect information, and transfer calls to your team — all without human intervention.",
  },
  {
    q: "How do I create an agent?",
    a: "Use our guided wizard: describe your business, use case, and goals. Our AI generates the full conversation flow, objection handling, and qualification logic in seconds. No coding required.",
  },
  {
    q: "Can I connect my existing phone number?",
    a: "Yes. You can purchase inbound numbers directly through Appendify Voz and assign them to any agent. For outbound campaigns, we handle the telephony infrastructure for you.",
  },
  {
    q: "How does the University work?",
    a: "The University lets you run simulated test calls against your agent. Each call is evaluated by AI on criteria like tone, accuracy, and goal completion — so you can iterate and graduate your agent before going live.",
  },
  {
    q: "What voices are available?",
    a: "We offer a library of ultra-realistic AI voices across genders, accents, and styles. Preview any voice before assigning it to your agent.",
  },
];

const metrics = [
  { value: "10,000+", label: "Calls Handled" },
  { value: "95%", label: "Customer Satisfaction" },
  { value: "50%", label: "Cost Reduction" },
  { value: "<1s", label: "Response Latency" },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "$0.25",
    priceUnit: "/min",
    extra: null,
    description: "Perfect for trying it out",
    features: [
      "Standard AI voice agents",
      "1 active campaign",
      "Performance analytics",
      "Email support",
    ],
    cta: "Start Free",
    ctaHref: "/auth",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$0.20",
    priceUnit: "/min",
    extra: "+ $99/mo",
    description: "For growing teams",
    features: [
      "Everything in Starter",
      "HIPAA-compliant campaigns",
      "Multi-agent orchestration",
      "Priority support",
    ],
    cta: "Start Free",
    ctaHref: "/auth",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$0.15",
    priceUnit: "/min",
    extra: "+ $499+/mo",
    description: "Custom-built for scale",
    features: [
      "Everything in Pro",
      "White-label branding",
      "Dedicated number pools",
      "Custom SLA & onboarding",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:sales@aivoz.app",
    highlighted: false,
  },
];

const navLinks = ["Guarantee", "Features", "Pricing", "How It Works", "FAQ"];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-background/70 backdrop-blur-2xl border-b border-border/50"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[72px]">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={appendifyLogo} alt="Appendify Voz" className="h-8 w-8 object-contain" />
            <span className="text-lg font-bold tracking-tight">Appendify Voz</span>
          </Link>

          <div className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
            {navLinks.map((link, i) => (
              <span key={link} className="flex items-center">
                <a
                  href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                  className="px-3 py-2 rounded-lg hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                >
                  {link}
                </a>
                {i < navLinks.length - 1 && (
                  <span className="text-border mx-1">·</span>
                )}
              </span>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute inset-0 m-auto h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </button>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button size="sm" asChild className="rounded-full px-5">
              <Link to="/auth">
                Get Started Free
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <button
            className="md:hidden p-2 text-muted-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden glass-card border-t border-border/50 px-4 pb-5 pt-2 space-y-1">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-3 text-sm text-muted-foreground py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <span className="relative h-4 w-4">
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0 absolute inset-0" />
                <Moon className="h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100 absolute inset-0" />
              </span>
              <span className="dark:hidden">Light Mode</span>
              <span className="hidden dark:inline">Dark Mode</span>
            </button>
            {navLinks.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                className="block text-sm text-muted-foreground py-2.5 px-3 rounded-lg hover:bg-muted/50"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link}
              </a>
            ))}
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" size="sm" asChild className="flex-1">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button size="sm" asChild className="flex-1 rounded-full">
                <Link to="/auth">Get Started Free</Link>
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-24 sm:pt-48 sm:pb-32 px-4">
        {/* Multi-layer gradient background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-primary/8 blur-[150px]" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] rounded-full bg-accent/10 blur-[100px]" />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge pill */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-8"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Trusted by 500+ businesses</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.03em] leading-[1.08]"
          >
            AI Voice Agents That{" "}
            <span className="text-gradient-primary">Sound Human</span>,{" "}
            <br className="hidden sm:block" />
            Scale Effortlessly
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-7 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            Build, deploy, and manage next-generation AI phone agents. Automate
            outbound campaigns, handle inbound calls, and qualify leads — all
            with natural conversation.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" asChild className="rounded-full px-8 text-base h-12">
              <Link to="/auth">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full px-8 text-base h-12 border-border/60 hover:bg-muted/50">
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* 10-Minute Guarantee */}
      <section id="guarantee" className="py-20 sm:py-28 px-4">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={0}
          className="max-w-2xl mx-auto gradient-border rounded-2xl p-12 sm:p-16 text-center"
        >
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-7">
            <Timer className="h-7 w-7" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            The Fastest, Simplest Way to Deploy an AI Agent
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            If you don't have a fully functional, well-behaved agent in{" "}
            <span className="font-bold text-primary">10 minutes</span>, we'll
            give you <span className="font-bold text-primary">$100 in credit</span>.
          </p>
          <Button size="lg" asChild className="rounded-full px-8 text-base h-12 mb-10">
            <Link to="/auth">
              Start Your 10-Minute Clock
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Accordion type="single" collapsible className="text-left">
            <AccordionItem value="terms" className="border-none">
              <AccordionTrigger className="text-xs text-muted-foreground hover:no-underline justify-center gap-2 py-2">
                Terms &amp; Conditions
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground space-y-2">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>"Fully functional" means the agent can hold a natural conversation, follow your script, and handle basic objections as demonstrated in a test call via the University.</li>
                  <li>The 10-minute clock starts when you begin the agent creation wizard and stops when you run your first successful test call.</li>
                  <li>Credit is applied to your Appendify Voz account and can be used toward calling minutes.</li>
                  <li>To claim, contact support with your account email and a screenshot of your wizard start time.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </motion.div>
      </section>

      {/* Metrics */}
      <section className="py-20 sm:py-24 border-y border-border/50">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <MetricNumber value={m.value} delay={i * 0.1} />
              <div className="mt-2 text-sm text-muted-foreground font-medium">{m.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 sm:py-32 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <motion.h2
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            >
              How It Works
            </motion.h2>
            <motion.p
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
              className="mt-5 text-muted-foreground max-w-xl mx-auto text-lg"
            >
              From idea to live calls in three simple steps.
            </motion.p>
          </div>

          <AgentDemoAnimation />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 sm:py-32 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <motion.h2
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            >
              Everything You Need to Run AI Phone Agents
            </motion.h2>
            <motion.p
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
              className="mt-5 text-muted-foreground max-w-xl mx-auto text-lg"
            >
              A complete platform for building, testing, deploying, and optimizing voice AI at scale.
            </motion.p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="glass-card rounded-2xl p-8 hover-lift group"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold mb-2.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Smart Transfer callout */}
      <section className="py-24 sm:py-32 px-4 relative">
        {/* Decorative gradient line */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-7">
              <PhoneForwarded className="h-7 w-7" />
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Smart Call Transfer
            </h2>
            <p className="mt-5 text-muted-foreground max-w-xl mx-auto text-lg leading-relaxed">
              When your AI agent qualifies a lead or detects a situation that
              needs human attention, it seamlessly transfers the call to your
              team — with full context.
            </p>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 sm:py-32 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            >
              Frequently Asked Questions
            </motion.h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="glass-card rounded-xl px-7 border-none"
              >
                <AccordionTrigger className="text-left text-[15px] font-medium hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] text-muted-foreground leading-relaxed pb-5">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 sm:py-32 px-4">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={0}
          className="max-w-3xl mx-auto gradient-border rounded-3xl p-12 sm:p-16 text-center relative overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Ready to Automate Your Calls?
            </h2>
            <p className="mt-5 text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto">
              Join thousands of businesses using AI voice agents to scale conversations, qualify leads, and close deals faster.
            </p>
            <div className="mt-10">
              <Button size="lg" asChild className="rounded-full px-10 text-base h-12">
                <Link to="/auth">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src={appendifyLogo} alt="Appendify Voz" className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold">Appendify Voz</span>
          </div>
          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Appendify Voz. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
