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
  Zap,
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
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
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
    desc: "Run simulated calls in the Gym. AI evaluates every conversation and scores agent performance before going live.",
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
    a: "Yes. You can purchase inbound numbers directly through VoiceForge and assign them to any agent. For outbound campaigns, we handle the telephony infrastructure for you.",
  },
  {
    q: "How does the testing gym work?",
    a: "The Gym lets you run simulated test calls against your agent. Each call is evaluated by AI on criteria like tone, accuracy, and goal completion — so you can iterate before going live.",
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

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/80 backdrop-blur-xl border-b border-border"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">VoiceForge</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth">Get Started Free</Link>
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
          <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border px-4 pb-4 space-y-3">
            <a href="#features" className="block text-sm text-muted-foreground py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="block text-sm text-muted-foreground py-2" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="#faq" className="block text-sm text-muted-foreground py-2" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="sm" asChild className="flex-1">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button size="sm" asChild className="flex-1">
                <Link to="/auth">Get Started Free</Link>
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-4">
        {/* Gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
          >
            AI Voice Agents That{" "}
            <span className="text-gradient-primary">Sound Human</span>,{" "}
            Scale Effortlessly
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Build, deploy, and manage next-generation AI phone agents. Automate
            outbound campaigns, handle inbound calls, and qualify leads — all
            with natural conversation.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" asChild className="px-8 text-base">
              <Link to="/auth">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="px-8 text-base">
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-16 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-3xl sm:text-4xl font-extrabold text-primary">{m.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              From idea to live calls in three simple steps.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <motion.div
                key={s.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="surface-elevated rounded-xl p-8 text-center"
              >
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5">
                  <s.icon className="h-7 w-7" />
                </div>
                <div className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">
                  Step {i + 1}
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28 px-4 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything You Need to Run AI Phone Agents
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              A complete platform for building, testing, deploying, and optimizing voice AI at scale.
            </p>
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
                className="surface-elevated rounded-xl p-6 hover:border-primary/30 transition-colors"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Smart Transfer callout */}
      <section className="py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
              <PhoneForwarded className="h-7 w-7" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Smart Call Transfer
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto text-lg">
              When your AI agent qualifies a lead or detects a situation that
              needs human attention, it seamlessly transfers the call to your
              team — with full context.
            </p>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28 px-4 bg-muted/20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="surface-elevated rounded-lg px-6 border-none"
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 sm:py-28 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to Automate Your Calls?
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Join thousands of businesses using AI voice agents to scale conversations, qualify leads, and close deals faster.
          </p>
          <div className="mt-8">
            <Button size="lg" asChild className="px-10 text-base">
              <Link to="/auth">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">VoiceForge</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} VoiceForge. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
