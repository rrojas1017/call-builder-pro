import { HelpCircle } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

type SectionKey =
  | "identity"
  | "language_mode"
  | "persona"
  | "opening_line"
  | "tone_style"
  | "success_definition"
  | "conversation_flow"
  | "qualification_rules"
  | "disqualification_rules"
  | "compliance"
  | "voice"
  | "ambient_sound"
  | "voice_tuning"
  | "speaking_speed"
  | "temperature"
  | "interruption_sensitivity"
  | "call_ending"
  | "business_hours"
  | "sms"
  | "voicemail"
  | "outbound_number"
  | "voice_provider"
  | "advanced";

interface HelpEntry {
  title: string;
  description: string;
  examples: string[];
  tip?: string;
}

const SECTION_HELP: Record<SectionKey, HelpEntry> = {
  identity: {
    title: "Identity",
    description: "Your agent's display name and internal description. Only your team sees these — callers never hear the agent name.",
    examples: [
      '"ACA New Mover Agent"',
      '"Spanish Medicare Follow-up"',
    ],
    tip: "Use descriptive names so your team can quickly tell agents apart.",
  },
  language_mode: {
    title: "Language & Mode",
    description: "Choose what language the agent speaks and whether it makes calls, receives them, or both.",
    examples: [
      "Outbound = the agent dials contacts from your lists (cold calls)",
      "Inbound = the agent answers incoming calls on your phone number",
      "Hybrid = the agent can do both",
    ],
    tip: "Most lead-gen campaigns use Outbound. Switch to Inbound if you're routing calls from ads or landing pages.",
  },
  persona: {
    title: "Persona Name",
    description: "The human-sounding name your agent introduces itself as during calls. Callers hear this name.",
    examples: [
      '"Sofia Martinez"',
      '"Alex Johnson"',
    ],
    tip: "Pick a name that matches the voice gender and language. A natural-sounding name builds trust.",
  },
  opening_line: {
    title: "Opening Line",
    description: "The very first sentence the agent says when someone picks up. This is the most important part of your script — it determines if the person stays on the line.",
    examples: [
      '"Hey {{first_name}}, this is {{agent_name}} — I\'m calling about the health coverage you asked about. Got a quick second?"',
      '"Hi there, this is {{agent_name}} calling from HealthPlus. Am I speaking with {{first_name}}?"',
    ],
    tip: "Keep it under 15 seconds. Use {{first_name}} and {{agent_name}} as placeholders — they get replaced with real data on each call.",
  },
  tone_style: {
    title: "Tone / Style",
    description: "How the agent sounds personality-wise throughout the conversation. This affects word choice, pacing, and how formal or casual the agent is.",
    examples: [
      '"friendly and casual" — like a helpful neighbor',
      '"professional and empathetic" — like a doctor\'s office',
      '"upbeat and energetic" — like a sales rep',
    ],
    tip: "Match the tone to your audience. Elderly callers respond better to calm and patient. Younger callers prefer casual.",
  },
  success_definition: {
    title: "Success Definition",
    description: "What counts as a 'win' for this agent. The AI uses this to know when a call has achieved its goal.",
    examples: [
      '"Caller confirms interest and is warm-transferred to a licensed agent"',
      '"Appointment is booked and confirmed"',
      '"Caller provides consent and qualifies based on age and income"',
    ],
    tip: "Be specific. 'Get a transfer' is better than 'help the caller.' This directly affects how the agent steers conversations.",
  },
  conversation_flow: {
    title: "Must-Collect Fields",
    description: "Data points the agent MUST gather during each call before transferring or ending. The agent will ask for these in order.",
    examples: [
      "consent → zip_code → age → income_range → coverage_type",
      "name → email → appointment_date",
    ],
    tip: "Put consent and easy questions first. Save sensitive questions (income, SSN) for after you've built rapport.",
  },
  qualification_rules: {
    title: "Qualification Rules",
    description: "Conditions that make a lead 'qualified.' When ALL these conditions are met, the agent knows the caller is a good fit and can proceed to transfer or book.",
    examples: [
      '{"age_range": "18-64", "no_employer_coverage": true, "recently_moved": true}',
      '{"income_below_fpl": true, "state": "FL,TX,CA"}',
    ],
    tip: "Think of these as your 'green light' checklist. If a caller meets all of them, they're worth transferring to a live agent.",
  },
  disqualification_rules: {
    title: "Disqualification Rules",
    description: "Conditions that immediately disqualify a lead. If ANY of these are true, the agent politely ends the call instead of wasting a transfer.",
    examples: [
      '{"has_medicare": true} — already covered, can\'t help',
      '{"under_18": true} — not eligible',
      '{"do_not_call": true} — requested removal',
    ],
    tip: "These save you money by preventing bad transfers. Common ones: already has coverage, wrong age, wrong state.",
  },
  compliance: {
    title: "Compliance",
    description: "Legal requirements your agent must follow on every call. This includes recording consent (required in many states) and mandatory disclosures.",
    examples: [
      "TCPA consent: 'This call may be recorded for quality assurance. Is that okay?'",
      "State disclosure: 'I'm not a licensed insurance agent, I'm here to see if you might qualify for assistance.'",
    ],
    tip: "When in doubt, keep both toggles ON. It's always safer to ask for consent and read disclosures than to skip them.",
  },
  voice: {
    title: "Voice",
    description: "The AI voice your agent uses on calls. Different voices have different accents, genders, and tones.",
    examples: [
      "MiniMax voices — highest quality, most natural-sounding",
      "ElevenLabs voices — wide variety of accents",
    ],
    tip: "MiniMax voices (shown first) sound the most human. Always preview a voice before selecting it.",
  },
  ambient_sound: {
    title: "Ambient Sound",
    description: "Optional background noise added to the call to make it sound like the agent is calling from a real environment instead of dead silence.",
    examples: [
      '"Coffee Shop" — casual, warm background chatter',
      '"Call Center" — sounds like a busy office',
      '"None" — clean, silent background',
    ],
    tip: "A little background noise makes the AI sound more human and reduces the 'uncanny valley' effect. Coffee Shop is the most popular choice.",
  },
  voice_tuning: {
    title: "Voice Tuning",
    description: "Fine-tune how your agent speaks. These sliders control speed, creativity, and how the agent handles interruptions.",
    examples: [
      "Speed 0.8 + low temperature = slow, scripted, predictable (good for elderly callers)",
      "Speed 1.2 + high temperature = fast, improvised, energetic (good for younger audiences)",
    ],
  },
  speaking_speed: {
    title: "Speaking Speed",
    description: "How fast the agent talks. 1.0 is normal human speed.",
    examples: [
      "0.8x — slower, easier to understand (great for elderly or non-native speakers)",
      "1.0x — normal conversational speed",
      "1.3x — brisk, energetic pace",
    ],
    tip: "If callers frequently ask the agent to repeat things, try lowering the speed to 0.8 or 0.9.",
  },
  temperature: {
    title: "Temperature (Creativity)",
    description: "Controls how creative or unpredictable the agent's responses are. Low = sticks closely to your script. High = improvises more.",
    examples: [
      "0.3 — very predictable, follows the script almost word-for-word",
      "0.7 — balanced (recommended for most use cases)",
      "0.9 — highly creative, may go off-script to handle unusual questions",
    ],
    tip: "Start at 0.7. Only go lower if the agent is saying unexpected things, or higher if conversations feel too robotic.",
  },
  interruption_sensitivity: {
    title: "Interruption Sensitivity",
    description: "How quickly the agent stops talking when the caller starts speaking. Measured in milliseconds.",
    examples: [
      "50ms — ultra-responsive, stops immediately (can feel choppy)",
      "100ms — balanced (recommended)",
      "300ms+ — finishes its sentences before listening (can feel rude)",
    ],
    tip: "100ms works for most cases. Lower it if callers complain the agent 'talks over them.'",
  },
  call_ending: {
    title: "Call Ending / Transfer",
    description: "What happens when the call reaches its conclusion. You can either have the agent wrap up and hang up, or warm-transfer the caller to a live person.",
    examples: [
      "End normally — agent says goodbye and disconnects",
      "Transfer — agent says 'Let me connect you with a specialist' and dials your transfer number",
    ],
    tip: "For lead-gen, always use Transfer with a real phone number. The agent stays on the line during the handoff to introduce the caller.",
  },
  business_hours: {
    title: "Business Hours",
    description: "The days and times when the agent is allowed to make or receive calls. Calls outside this window are automatically skipped or queued.",
    examples: [
      "Mon–Fri 9am–5pm Eastern — standard business hours",
      "Mon–Sat 8am–8pm Central — extended hours for more coverage",
    ],
    tip: "Set these to match YOUR team's availability, especially if you're doing transfers. No point transferring at 10pm if nobody's there to answer.",
  },
  sms: {
    title: "SMS Follow-up",
    description: "Automatically send a text message after the call ends. Useful for sending links, appointment confirmations, or follow-up info.",
    examples: [
      "After a qualified call: 'Thanks for chatting with us! Here's more info: [link]'",
      "After a missed call: 'Sorry we missed you — call us back at 555-1234'",
    ],
    tip: "SMS follow-ups can significantly increase conversion rates, especially for appointment-based campaigns.",
  },
  voicemail: {
    title: "Voicemail Message",
    description: "If the call goes to voicemail, the agent will leave this pre-written message instead of just hanging up.",
    examples: [
      '"Hi, this is Sarah calling about the health coverage you asked about. Please call us back at 555-123-4567 at your convenience."',
    ],
    tip: "Keep voicemails under 30 seconds. Always include a callback number. Make it sound personal, not like a robo-call.",
  },
  outbound_number: {
    title: "Outbound Number",
    description: "The phone number that appears on the caller's phone when your agent calls. You can pick a specific number or let the system rotate through your pool.",
    examples: [
      "Auto — rotates through all your verified numbers to avoid spam flags",
      "Specific number — always calls from the same number (good for callbacks)",
    ],
    tip: "Using 'Auto' with multiple numbers reduces the chance of your calls being flagged as spam.",
  },
  voice_provider: {
    title: "Voice Provider",
    description: "The underlying AI engine that powers your agent's voice and conversation logic. This is managed automatically.",
    examples: [
      "Append — our integrated voice AI platform",
    ],
    tip: "This is handled for you. If you see errors here, contact support.",
  },
  advanced: {
    title: "Advanced: Raw Spec Editor",
    description: "Edit the raw JSON configuration directly. This is for power users who want to fine-tune settings not available in the UI above.",
    examples: [
      "Add custom pronunciation guides",
      "Set retry policies",
      "Configure escalation rules",
    ],
    tip: "⚠️ Changes here override all fields above. Only use if you know what you're doing. Invalid JSON will be ignored.",
  },
};

interface SectionHelpProps {
  section: SectionKey;
  className?: string;
}

export function SectionHelp({ section, className }: SectionHelpProps) {
  const help = SECTION_HELP[section];
  if (!help) return null;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors ${className || ""}`}
          aria-label={`Help: ${help.title}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 p-4 space-y-2.5"
      >
        <p className="text-sm font-semibold text-foreground">{help.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {help.description}
        </p>
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Examples
          </p>
          <ul className="space-y-1">
            {help.examples.map((ex, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground flex items-start gap-1.5"
              >
                <span className="text-primary mt-0.5 shrink-0">•</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>
        {help.tip && (
          <div className="rounded-md bg-primary/5 border border-primary/10 px-2.5 py-1.5">
            <p className="text-[11px] text-foreground/80">
              <span className="font-medium">💡 Tip:</span> {help.tip}
            </p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
