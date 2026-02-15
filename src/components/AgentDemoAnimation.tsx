import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageSquare, Phone, Rocket, CheckCircle } from "lucide-react";

const STEP_DURATION = 4000;

const steps = [
  { label: "Create", icon: Sparkles },
  { label: "Train", icon: MessageSquare },
  { label: "Deploy", icon: Rocket },
];

/* ── Scene 1: Create ──────────────────────────────── */
function CreateScene() {
  const prompt = 'Book dental appointments, handle objections, confirm time slots…';
  const agentName = "DentalBot Pro";
  const [charIndex, setCharIndex] = useState(0);
  const [nameIndex, setNameIndex] = useState(0);

  useEffect(() => {
    if (charIndex < prompt.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), 30);
      return () => clearTimeout(t);
    }
  }, [charIndex, prompt.length]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (nameIndex < agentName.length) {
        const t = setTimeout(() => setNameIndex((c) => c + 1), 60);
        return () => clearTimeout(t);
      }
    }, 400);
    return () => clearTimeout(delay);
  }, [nameIndex, agentName.length]);

  return (
    <div className="space-y-4">
      {/* Agent name field */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Agent Name</div>
        <div className="h-10 rounded-lg border border-border bg-background px-3 flex items-center">
          <span className="text-sm font-medium text-foreground">
            {agentName.slice(0, nameIndex)}
          </span>
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
            className="inline-block w-0.5 h-4 bg-primary ml-0.5"
          />
        </div>
      </div>

      {/* Prompt field */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">What should your agent do?</div>
        <div className="min-h-[72px] rounded-lg border border-border bg-background p-3">
          <span className="text-sm text-foreground leading-relaxed">
            {prompt.slice(0, charIndex)}
          </span>
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
            className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 align-middle"
          />
        </div>
      </div>

      {/* Generate button */}
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        className="pt-1"
      >
        <div className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          <Sparkles className="h-4 w-4" />
          Generate Agent
        </div>
      </motion.div>
    </div>
  );
}

/* ── Scene 2: Train ───────────────────────────────── */
function TrainScene() {
  const bubbles = [
    { from: "agent", text: "Hi! I'm calling from Bright Smile Dental. Do you have a moment?" },
    { from: "user", text: "Sure, what's this about?" },
    { from: "agent", text: "We'd love to schedule your annual cleaning. Are mornings or afternoons better?" },
    { from: "user", text: "Mornings work. How about Thursday?" },
  ];

  return (
    <div className="space-y-4">
      {/* Chat bubbles */}
      <div className="space-y-2.5 max-h-[140px] overflow-hidden">
        {bubbles.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: b.from === "agent" ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.45, duration: 0.4 }}
            className={`flex ${b.from === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                b.from === "agent"
                  ? "bg-primary/10 text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {b.text}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Score meter */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Quality Score</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
            className="font-bold text-primary"
          >
            95%
          </motion.span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "95%" }}
            transition={{ delay: 1.2, duration: 1.2, ease: "easeOut" }}
            className="h-full rounded-full bg-primary"
          />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.4 }}
          className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Agent passed all test scenarios
        </motion.div>
      </div>
    </div>
  );
}

/* ── Scene 3: Deploy ──────────────────────────────── */
function DeployScene() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setCount((c) => (c < 247 ? c + Math.ceil(Math.random() * 12) : 247));
    }, 200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      {/* Ringing phone */}
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, repeatDelay: 1 }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Phone className="h-5 w-5" />
        </motion.div>
        <div>
          <div className="text-sm font-semibold text-foreground">Campaign Active</div>
          <div className="text-xs text-muted-foreground">3 concurrent lines</div>
        </div>
      </div>

      {/* Campaign Live badge */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 20 }}
        className="inline-flex items-center gap-2 rounded-full bg-green-500/15 border border-green-500/30 px-4 py-2"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-sm font-semibold text-green-700 dark:text-green-400">Campaign Live</span>
      </motion.div>

      {/* Call counter */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        {[
          { label: "Calls Made", value: count },
          { label: "Booked", value: Math.floor(count * 0.34) },
          { label: "Success Rate", value: `${Math.min(count > 0 ? 34 : 0, 34)}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-secondary/50 p-2.5 text-center">
            <div className="text-lg font-bold text-foreground">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground font-medium">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────── */
const scenes = [CreateScene, TrainScene, DeployScene];

export default function AgentDemoAnimation() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => setStep((s) => (s + 1) % 3), []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(advance, STEP_DURATION);
    return () => clearInterval(timer);
  }, [paused, advance]);

  const Scene = scenes[step];

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }}
      className="max-w-xl mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Screen mockup */}
      <div className="gradient-border rounded-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-muted/30">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-3 text-[10px] text-muted-foreground font-mono">appendify.ai</span>
        </div>

        {/* Scene area */}
        <div className="p-6 sm:p-8 min-h-[280px] flex items-start">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <Scene />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          return (
            <button
              key={s.label}
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 ${
                active
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
