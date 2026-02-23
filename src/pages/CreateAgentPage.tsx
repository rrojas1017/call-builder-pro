import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Sparkles, ArrowRight, ArrowLeft, CheckCircle, Eye, Pencil, FileText, Phone, PhoneIncoming, PhoneForwarded, Shield, Target, Users, Mic, Save, Volume2, Globe, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { guardOpeningLine } from "@/lib/openingLineGuard";
import { useRetellVoices } from "@/hooks/useRetellVoices";
import { VoiceSelector } from "@/components/VoiceSelector";
import { useOutboundNumbers } from "@/hooks/useOutboundNumbers";
import { RetellAgentManager } from "@/components/RetellAgentManager";

// ─── Translation map ────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "pt", flag: "🇧🇷", name: "Português" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
] as const;

type LangCode = typeof LANGUAGES[number]["code"];

const TRANSLATIONS: Record<LangCode, {
  step0Title: string;
  step0Sub: string;
  agentNameLabel: string;
  agentNamePlaceholder: string;
  personaNameLabel: string;
  personaNamePlaceholder: string;
  personaNameHint: string;
  whatShouldDo: string;
  websiteLabel: string;
  websitePlaceholder: string;
  websiteHint: string;
  uploadLabel: string;
  generateBtn: string;
  step1Title: string;
  step1Sub: string;
  useDefaultsBtn: string;
  confirmBtn: string;
  backBtn: string;
  saveBtn: string;
  voicePreviewText: string;
  step2Title: string;
  step2Sub: string;
  knowledgeExtracted: string;
  agentLanguageLabel: string;
  answerPlaceholder: string;
  whyMatters: string;
}> = {
  en: {
    step0Title: "Build Your AI Call Agent",
    step0Sub: "Describe what you want the agent to do. We'll handle the structure.",
    agentNameLabel: "Agent Name",
    agentNamePlaceholder: "e.g. Health Insurance Pre-Qualifier",
    personaNameLabel: "Agent Persona Name",
    personaNamePlaceholder: "e.g. Sofia, Alex, Carlos",
    personaNameHint: "This is the name your agent will introduce itself as on the call.",
    whatShouldDo: "What should your agent do?",
    websiteLabel: "Company or product website (optional)",
    websitePlaceholder: "https://yourcompany.com/products",
    websiteHint: "We'll automatically read this page to give your agent product knowledge from day one.",
    uploadLabel: "Or upload a document (.txt, .docx, .pdf)",
    generateBtn: "Generate My Agent",
    step1Title: "Let's Make It Work Perfectly",
    step1Sub: "Answer a few quick questions so your agent performs correctly.",
    useDefaultsBtn: "Review Defaults",
    confirmBtn: "Confirm & Review",
    backBtn: "Back",
    saveBtn: "Save Agent",
    voicePreviewText: "Hello! I'm calling to help you find the best option for your needs. Do you have a moment?",
    step2Title: "Review & Save Your Agent",
    step2Sub: "Here's what your agent will do. Save it, then head to the Test Lab to fine-tune.",
    knowledgeExtracted: "Product knowledge extracted from your website and added to this agent's knowledge base.",
    agentLanguageLabel: "Agent Language",
    answerPlaceholder: "Your answer...",
    whyMatters: "Why this matters:",
  },
  es: {
    step0Title: "Crea tu Agente de Llamadas con IA",
    step0Sub: "Describe lo que quieres que haga el agente. Nosotros nos encargamos de la estructura.",
    agentNameLabel: "Nombre del Agente",
    agentNamePlaceholder: "ej. Pre-calificador de Seguros de Salud",
    personaNameLabel: "Nombre de Persona del Agente",
    personaNamePlaceholder: "ej. Sofía, Alejandro, Carlos",
    personaNameHint: "Este es el nombre con el que el agente se presentará en la llamada.",
    whatShouldDo: "¿Qué debe hacer tu agente?",
    websiteLabel: "Sitio web de la empresa o producto (opcional)",
    websitePlaceholder: "https://tuempresa.com/productos",
    websiteHint: "Leeremos esta página automáticamente para dar a tu agente conocimiento del producto desde el primer día.",
    uploadLabel: "O sube un documento (.txt, .docx, .pdf)",
    generateBtn: "Generar Mi Agente",
    step1Title: "Vamos a Perfeccionarlo",
    step1Sub: "Responde unas preguntas rápidas para que tu agente funcione correctamente.",
    useDefaultsBtn: "Revisar Valores Predeterminados",
    confirmBtn: "Confirmar y Revisar",
    backBtn: "Volver",
    saveBtn: "Guardar Agente",
    voicePreviewText: "¡Hola! Le llamo para ayudarle a encontrar la mejor opción para sus necesidades. ¿Tiene un momento?",
    step2Title: "Revisar y Guardar tu Agente",
    step2Sub: "Esto es lo que hará tu agente. Guárdalo y ve al Laboratorio de Pruebas para ajustarlo.",
    knowledgeExtracted: "Conocimiento del producto extraído de tu sitio web y añadido a la base de conocimiento de este agente.",
    agentLanguageLabel: "Idioma del Agente",
    answerPlaceholder: "Tu respuesta...",
    whyMatters: "Por qué importa:",
  },
  fr: {
    step0Title: "Créez votre Agent d'Appel IA",
    step0Sub: "Décrivez ce que vous voulez que l'agent fasse. Nous gérons la structure.",
    agentNameLabel: "Nom de l'Agent",
    agentNamePlaceholder: "ex. Pré-qualificateur d'Assurance Santé",
    personaNameLabel: "Nom de Persona de l'Agent",
    personaNamePlaceholder: "ex. Sophie, Alex, Pierre",
    personaNameHint: "C'est le nom que votre agent utilisera pour se présenter lors de l'appel.",
    whatShouldDo: "Que doit faire votre agent ?",
    websiteLabel: "Site web de l'entreprise ou du produit (optionnel)",
    websitePlaceholder: "https://votreentreprise.com/produits",
    websiteHint: "Nous lirons automatiquement cette page pour donner à votre agent une connaissance du produit dès le premier jour.",
    uploadLabel: "Ou téléchargez un document (.txt, .docx, .pdf)",
    generateBtn: "Générer Mon Agent",
    step1Title: "Optimisons-le Ensemble",
    step1Sub: "Répondez à quelques questions rapides pour que votre agent fonctionne correctement.",
    useDefaultsBtn: "Réviser les Valeurs par Défaut",
    confirmBtn: "Confirmer et Réviser",
    backBtn: "Retour",
    saveBtn: "Sauvegarder l'Agent",
    voicePreviewText: "Bonjour ! Je vous appelle pour vous aider à trouver la meilleure option pour vos besoins. Avez-vous un moment ?",
    step2Title: "Vérifier et Sauvegarder votre Agent",
    step2Sub: "Voici ce que fera votre agent. Sauvegardez-le, puis rendez-vous au Lab de Test pour l'affiner.",
    knowledgeExtracted: "Connaissances produit extraites de votre site web et ajoutées à la base de connaissances de cet agent.",
    agentLanguageLabel: "Langue de l'Agent",
    answerPlaceholder: "Votre réponse...",
    whyMatters: "Pourquoi c'est important :",
  },
  pt: {
    step0Title: "Crie seu Agente de Chamadas com IA",
    step0Sub: "Descreva o que você quer que o agente faça. Nós cuidamos da estrutura.",
    agentNameLabel: "Nome do Agente",
    agentNamePlaceholder: "ex. Pré-qualificador de Seguro Saúde",
    personaNameLabel: "Nome de Persona do Agente",
    personaNamePlaceholder: "ex. Sofia, Alex, Carlos",
    personaNameHint: "Este é o nome com que o agente se apresentará na chamada.",
    whatShouldDo: "O que seu agente deve fazer?",
    websiteLabel: "Site da empresa ou produto (opcional)",
    websitePlaceholder: "https://suaempresa.com.br/produtos",
    websiteHint: "Leremos esta página automaticamente para dar ao seu agente conhecimento do produto desde o primeiro dia.",
    uploadLabel: "Ou envie um documento (.txt, .docx, .pdf)",
    generateBtn: "Gerar Meu Agente",
    step1Title: "Vamos Deixá-lo Perfeito",
    step1Sub: "Responda algumas perguntas rápidas para que seu agente funcione corretamente.",
    useDefaultsBtn: "Revisar Padrões",
    confirmBtn: "Confirmar e Revisar",
    backBtn: "Voltar",
    saveBtn: "Salvar Agente",
    voicePreviewText: "Olá! Estou ligando para ajudá-lo a encontrar a melhor opção para suas necessidades. Tem um momento?",
    step2Title: "Revisar e Salvar seu Agente",
    step2Sub: "Veja o que seu agente fará. Salve-o e vá ao Laboratório de Testes para ajustar.",
    knowledgeExtracted: "Conhecimento do produto extraído do seu site e adicionado à base de conhecimento deste agente.",
    agentLanguageLabel: "Idioma do Agente",
    answerPlaceholder: "Sua resposta...",
    whyMatters: "Por que isso importa:",
  },
  de: {
    step0Title: "Erstellen Sie Ihren KI-Anruf-Agenten",
    step0Sub: "Beschreiben Sie, was der Agent tun soll. Wir kümmern uns um die Struktur.",
    agentNameLabel: "Agentenname",
    agentNamePlaceholder: "z.B. Krankenversicherungs-Vorqualifizierer",
    personaNameLabel: "Persona-Name des Agenten",
    personaNamePlaceholder: "z.B. Sofia, Alex, Klaus",
    personaNameHint: "Dies ist der Name, mit dem sich Ihr Agent im Anruf vorstellt.",
    whatShouldDo: "Was soll Ihr Agent tun?",
    websiteLabel: "Unternehmens- oder Produktwebsite (optional)",
    websitePlaceholder: "https://ihrfirma.de/produkte",
    websiteHint: "Wir lesen diese Seite automatisch, um Ihrem Agenten von Anfang an Produktwissen zu geben.",
    uploadLabel: "Oder laden Sie ein Dokument hoch (.txt, .docx, .pdf)",
    generateBtn: "Meinen Agenten Generieren",
    step1Title: "Lassen Sie uns ihn Perfektionieren",
    step1Sub: "Beantworten Sie einige schnelle Fragen, damit Ihr Agent korrekt funktioniert.",
    useDefaultsBtn: "Standardwerte Überprüfen",
    confirmBtn: "Bestätigen und Überprüfen",
    backBtn: "Zurück",
    saveBtn: "Agenten Speichern",
    voicePreviewText: "Hallo! Ich rufe an, um Ihnen zu helfen, die beste Option für Ihre Bedürfnisse zu finden. Haben Sie einen Moment?",
    step2Title: "Ihren Agenten Überprüfen und Speichern",
    step2Sub: "So wird Ihr Agent agieren. Speichern Sie ihn und gehen Sie zum Testlabor, um ihn zu verfeinern.",
    knowledgeExtracted: "Produktwissen wurde von Ihrer Website extrahiert und zur Wissensdatenbank dieses Agenten hinzugefügt.",
    agentLanguageLabel: "Agentensprache",
    answerPlaceholder: "Ihre Antwort...",
    whyMatters: "Warum das wichtig ist:",
  },
  it: {
    step0Title: "Crea il tuo Agente di Chiamate IA",
    step0Sub: "Descrivi cosa vuoi che l'agente faccia. Noi gestiamo la struttura.",
    agentNameLabel: "Nome dell'Agente",
    agentNamePlaceholder: "es. Pre-qualificatore Assicurazione Sanitaria",
    personaNameLabel: "Nome Persona dell'Agente",
    personaNamePlaceholder: "es. Sofia, Alex, Marco",
    personaNameHint: "Questo è il nome con cui il tuo agente si presenterà durante la chiamata.",
    whatShouldDo: "Cosa deve fare il tuo agente?",
    websiteLabel: "Sito web dell'azienda o del prodotto (opzionale)",
    websitePlaceholder: "https://tuaazienda.it/prodotti",
    websiteHint: "Leggeremo automaticamente questa pagina per dare al tuo agente conoscenza del prodotto fin dal primo giorno.",
    uploadLabel: "O carica un documento (.txt, .docx, .pdf)",
    generateBtn: "Genera il Mio Agente",
    step1Title: "Rendiamolo Perfetto",
    step1Sub: "Rispondi ad alcune domande rapide affinché il tuo agente funzioni correttamente.",
    useDefaultsBtn: "Rivedi i Valori Predefiniti",
    confirmBtn: "Conferma e Rivedi",
    backBtn: "Indietro",
    saveBtn: "Salva Agente",
    voicePreviewText: "Ciao! Ti chiamo per aiutarti a trovare la migliore opzione per le tue esigenze. Hai un momento?",
    step2Title: "Rivedi e Salva il tuo Agente",
    step2Sub: "Ecco cosa farà il tuo agente. Salvalo, poi vai al Test Lab per perfezionarlo.",
    knowledgeExtracted: "Conoscenza del prodotto estratta dal tuo sito web e aggiunta alla base di conoscenza di questo agente.",
    agentLanguageLabel: "Lingua dell'Agente",
    answerPlaceholder: "La tua risposta...",
    whyMatters: "Perché è importante:",
  },
};

// ─── Example prompts per language ────────────────────────────────────────────
const EXAMPLE_PROMPTS_BY_LANG: Record<LangCode, string[]> = {
  en: [
    "Calls leads to verify insurance eligibility and transfer qualified ones",
    "Schedules appointments and sends confirmations",
    "Surveys customers after purchases for feedback",
    "Handles inbound support calls and escalates complex issues",
  ],
  es: [
    "Llama a clientes potenciales para verificar elegibilidad de seguros y transferir los calificados",
    "Agenda citas y envía confirmaciones",
    "Encuesta clientes después de compras para obtener retroalimentación",
    "Atiende llamadas de soporte entrantes y escala problemas complejos",
  ],
  fr: [
    "Appelle les prospects pour vérifier l'éligibilité à l'assurance et transférer les qualifiés",
    "Planifie des rendez-vous et envoie des confirmations",
    "Interroge les clients après les achats pour des retours",
    "Gère les appels entrants de support et escalade les problèmes complexes",
  ],
  pt: [
    "Liga para leads para verificar elegibilidade de seguro e transferir os qualificados",
    "Agenda consultas e envia confirmações",
    "Pesquisa clientes após compras para feedback",
    "Atende chamadas de suporte e escala problemas complexos",
  ],
  de: [
    "Ruft Interessenten an, um Versicherungsberechtigung zu prüfen und qualifizierte weiterzuleiten",
    "Plant Termine und sendet Bestätigungen",
    "Befragt Kunden nach Käufen für Feedback",
    "Behandelt eingehende Support-Anrufe und eskaliert komplexe Probleme",
  ],
  it: [
    "Chiama i lead per verificare l'idoneità assicurativa e trasferire quelli qualificati",
    "Pianifica appuntamenti e invia conferme",
    "Sondaggia i clienti dopo gli acquisti per feedback",
    "Gestisce le chiamate di supporto in entrata ed escala i problemi complessi",
  ],
};

// ─── Steps per language ───────────────────────────────────────────────────────
const STEPS_BY_LANG: Record<LangCode, string[]> = {
  en: ["Build Your Agent", "Clarify Details", "Review & Save"],
  es: ["Crear tu Agente", "Clarificar Detalles", "Revisar y Guardar"],
  fr: ["Créer l'Agent", "Clarifier les Détails", "Réviser et Sauvegarder"],
  pt: ["Criar o Agente", "Clarificar Detalhes", "Revisar e Salvar"],
  de: ["Agent Erstellen", "Details Klären", "Prüfen und Speichern"],
  it: ["Crea l'Agente", "Chiarisci i Dettagli", "Rivedi e Salva"],
};

interface WizardQuestion {
  question: string;
  rationale: string;
  answer: string;
  suggested_default: string;
  order_index: number;
}

export default function CreateAgentPage() {
  const { voices: retellVoices, loading: voicesLoading, refetch: refetchVoices } = useRetellVoices();
  const { numbers: trustedNumbers } = useOutboundNumbers();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [spec, setSpec] = useState<any>(null);
  const [showRawSpec, setShowRawSpec] = useState(false);
  const [rawSpecText, setRawSpecText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [knowledgeExtracted, setKnowledgeExtracted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("maya");
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [aiAssistLoading, setAiAssistLoading] = useState<number | null>(null);
  
  const [retellAgentId, setRetellAgentId] = useState("");
  const [agentMode, setAgentMode] = useState<"outbound" | "inbound" | "hybrid">("outbound");
  const [agentLanguage, setAgentLanguage] = useState<LangCode>("en");
  const [personaName, setPersonaName] = useState("");

  const t = TRANSLATIONS[agentLanguage];
  const STEPS = STEPS_BY_LANG[agentLanguage];
  const EXAMPLE_PROMPTS = EXAMPLE_PROMPTS_BY_LANG[agentLanguage];

  // Step 1: Create project + generate spec
  const handleGenerateSpec = async () => {
    if (!user || !agentName.trim()) return;
    setLoading(true);
    setKnowledgeExtracted(false);
    try {
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile?.org_id) throw new Error("No organization found");

      let finalSourceText = sourceText || description;

      if (file) {
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("agent_sources").upload(filePath, file);
        if (uploadErr) throw uploadErr;
        finalSourceText += `\n[File uploaded: ${file.name}]`;
      }

      const { data: project, error: projErr } = await supabase.from("agent_projects").insert({
        org_id: profile.org_id,
        name: agentName,
        description,
        source_text: finalSourceText,
        created_by: user.id,
      }).select().single();
      if (projErr) throw projErr;
      setProjectId(project.id);

      // Generate spec and optionally ingest knowledge URL in parallel
      const promises: Promise<any>[] = [
        supabase.functions.invoke("generate-spec", { body: { project_id: project.id, language: agentLanguage } }),
      ];

      if (knowledgeUrl.trim()) {
        promises.push(
          supabase.functions.invoke("ingest-knowledge-source", {
            body: { project_id: project.id, url: knowledgeUrl.trim() },
          })
        );
      }

      const [specResult, knowledgeResult] = await Promise.all(promises);
      if (specResult.error) throw specResult.error;

      if (knowledgeResult && !knowledgeResult.error) {
        setKnowledgeExtracted(true);
      }

      setQuestions((specResult.data.questions || []).map((q: any) => ({
        ...q,
        suggested_default: q.answer || "",
        answer: q.answer || "",
      })));
      setSpec(specResult.data.spec);
      setStep(1);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Save answers
  const handleSaveAnswers = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-wizard-answers", {
        body: { project_id: projectId, answers: questions },
      });
      if (error) throw error;
      setSpec(data.spec);
      setRawSpecText(JSON.stringify(data.spec, null, 2));
      setTransferEnabled(!!data.spec?.transfer_required);
      setTransferPhone(data.spec?.transfer_phone_number || "");
      setAgentMode(data.spec?.mode || "outbound");
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Save agent
  const handleSaveAgent = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const voiceId = selectedVoice === "custom" ? customVoiceId.trim() : selectedVoice;
      const phoneDigits = transferPhone.replace(/\D/g, "");
      if (transferEnabled && phoneDigits.length < 10) {
        toast({ title: "Invalid phone number", description: "Please enter at least 10 digits for the transfer number.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const formattedPhone = transferEnabled && phoneDigits.length >= 10
        ? (phoneDigits.startsWith("1") ? `+${phoneDigits}` : `+1${phoneDigits}`)
        : null;

      // Auto-create Retell agent if no agent exists yet
      let finalRetellAgentId = retellAgentId;
      if (!retellAgentId) {
        try {
          const { data: retellData, error: retellErr } = await supabase.functions.invoke("manage-retell-agent", {
            body: {
              action: "create",
              config: {
                agent_name: agentName || personaName || "Appendify Agent",
                voice_id: voiceId,
                language: agentLanguage || "en-US",
                general_prompt: description || sourceText || undefined,
              },
            },
          });
          if (retellErr) throw retellErr;
          if (retellData?.agent_id) {
            finalRetellAgentId = retellData.agent_id;
            setRetellAgentId(retellData.agent_id);
            toast({ title: "Append agent created", description: "Your AI agent was configured automatically." });
          }
        } catch (retellCreateErr: any) {
          console.error("Auto-create Retell agent failed:", retellCreateErr);
          toast({ title: "Append agent creation failed", description: retellCreateErr.message, variant: "destructive" });
        }
      }

      // Guard: auto-fix hardcoded name mismatch in opening line
      let finalOpeningLine = spec?.opening_line || null;
      if (finalOpeningLine && personaName.trim()) {
        const guard = guardOpeningLine(finalOpeningLine, personaName.trim());
        if (guard.wasFixed) {
          finalOpeningLine = guard.corrected;
          toast({ title: "Opening line updated", description: `Replaced "${guard.oldName}" with your persona name placeholder.` });
        }
      }

      await supabase.from("agent_specs").update({
        voice_id: voiceId || undefined,
        transfer_required: transferEnabled,
        transfer_phone_number: formattedPhone,
        background_track: null, // configurable in Edit Agent
        voice_provider: "retell",
        retell_agent_id: finalRetellAgentId || null,
        mode: agentMode,
        language: agentLanguage,
        persona_name: personaName.trim() || null,
        opening_line: finalOpeningLine,
      } as any).eq("project_id", projectId);
      toast({ title: "Agent saved!", description: "Run test calls to fine-tune voice and delivery." });
      navigate("/agents");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateAnswer = (idx: number, answer: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, answer } : q)));
  };

  const handleAiAssist = async (idx: number) => {
    setAiAssistLoading(idx);
    try {
      const q = questions[idx];
      const { data, error } = await supabase.functions.invoke("wizard-ai-assist", {
        body: {
          question: q.question,
          current_answer: q.answer,
          agent_description: sourceText || description,
          agent_name: agentName,
          language: agentLanguage,
        },
      });
      if (error) throw error;
      if (data?.suggested_answer) {
        updateAnswer(idx, data.suggested_answer);
      }
    } catch (err: any) {
      toast({ title: "AI Assist failed", description: err.message, variant: "destructive" });
    } finally {
      setAiAssistLoading(null);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:inline", i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Build Your AI Call Agent */}
      {step === 0 && (
        <div className="space-y-5">
          <div className="surface-elevated rounded-xl p-6 space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.step0Title}</h1>
              <p className="text-muted-foreground mt-1">{t.step0Sub}</p>
            </div>

            {/* Language picker */}
            <div className="space-y-2">
              <Label>{t.agentLanguageLabel}</Label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setAgentLanguage(lang.code)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                      agentLanguage === lang.code
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.agentNameLabel}</Label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={t.agentNamePlaceholder} />
            </div>
            <div className="space-y-2">
              <Label>{t.personaNameLabel}</Label>
              <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder={t.personaNamePlaceholder} />
              <p className="text-xs text-muted-foreground">{t.personaNameHint}</p>
            </div>
            <div className="space-y-2">
              <Label>{t.whatShouldDo}</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setSourceText(prompt); setDescription(prompt); }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground hover:bg-primary/5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Textarea
                value={sourceText || description}
                onChange={(e) => { setSourceText(e.target.value); setDescription(e.target.value); }}
                placeholder={t.answerPlaceholder}
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t.websiteLabel}
              </Label>
              <Input
                value={knowledgeUrl}
                onChange={(e) => setKnowledgeUrl(e.target.value)}
                placeholder={t.websitePlaceholder}
                type="url"
              />
              <p className="text-xs text-muted-foreground">{t.websiteHint}</p>
            </div>
            <div className="space-y-2">
              <Label>{t.uploadLabel}</Label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                <Upload className="h-4 w-4" />
                {file ? file.name : "Choose file"}
                <input type="file" className="hidden" accept=".txt,.docx,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <Button onClick={handleGenerateSpec} disabled={loading || !agentName.trim()} className="w-full" size="lg">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {t.generateBtn}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Clarify Details */}
      {step === 1 && (
        <div className="surface-elevated rounded-xl p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.step1Title}</h1>
            <p className="text-muted-foreground mt-1">{t.step1Sub}</p>
          </div>
          {knowledgeExtracted && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t.knowledgeExtracted}</span>
            </div>
          )}
          {questions.map((q, i) => (
            <div key={i} className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start justify-between gap-2">
                <Label className="text-foreground font-medium">{q.question}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs gap-1"
                  disabled={aiAssistLoading === i}
                  onClick={() => handleAiAssist(i)}
                >
                  {aiAssistLoading === i ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI Assist
                </Button>
              </div>
              {q.rationale && (
                <p className="text-xs text-muted-foreground italic flex items-start gap-1">
                  <Shield className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{t.whyMatters} {q.rationale}</span>
                </p>
              )}
              <Textarea
                value={q.answer}
                onChange={(e) => updateAnswer(i, e.target.value)}
                rows={2}
                placeholder={t.answerPlaceholder}
              />
            </div>
          ))}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {t.backBtn}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setQuestions((prev) => prev.map((q) => ({
                  ...q,
                  answer: q.answer || q.suggested_default || "Use your best judgment based on industry standards",
                })));
                toast({ title: "Defaults applied", description: "Review and adjust if needed before continuing." });
              }}
              disabled={loading}
            >
              {t.useDefaultsBtn}
            </Button>
            <Button onClick={handleSaveAnswers} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              {t.confirmBtn}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Save */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.step2Title}</h1>
            <p className="text-muted-foreground mt-1">{t.step2Sub}</p>
          </div>

          {!showRawSpec && spec && (
            <div className="grid gap-4">
              <SummaryCard icon={<Users className="h-5 w-5" />} title="Who it calls" value={spec.mode === "inbound" ? "Handles incoming calls" : "Makes outbound calls to your contacts"} />
              <SummaryCard icon={<Phone className="h-5 w-5" />} title="What it says" value={spec.opening_line || "Standard greeting"} />
              <SummaryCard icon={<FileText className="h-5 w-5" />} title="What it collects" value={Array.isArray(spec.must_collect_fields) ? (spec.must_collect_fields as string[]).join(", ") : "Standard fields"} />
              <SummaryCard icon={<Shield className="h-5 w-5" />} title="Qualification logic" value={spec.qualification_rules ? JSON.stringify(spec.qualification_rules) : "No specific rules"} />
              <SummaryCard icon={<ArrowRight className="h-5 w-5" />} title="Transfer logic" value={transferEnabled ? `Transfers to ${transferPhone || "number below"}` : "Ends call normally"} />
              <SummaryCard icon={<Target className="h-5 w-5" />} title="Success definition" value={spec.success_definition || "Complete the call objectives"} />
              <SummaryCard icon={<Mic className="h-5 w-5" />} title="Voice" value={
                selectedVoice === "custom"
                  ? customVoiceId || "No custom ID set"
                  : `${retellVoices.find(v => v.voice_id === selectedVoice)?.name || selectedVoice}`
              } />
            </div>
          )}

          {/* Agent Mode */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Agent Mode</h3>
            <p className="text-xs text-muted-foreground">
              The AI detected this as <span className="font-medium text-foreground">{spec?.mode || "outbound"}</span>. Change if needed.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { value: "outbound" as const, label: "Outbound", icon: Phone, desc: "Makes calls to your contacts" },
                { value: "inbound" as const, label: "Inbound", icon: PhoneIncoming, desc: "Receives incoming calls" },
                { value: "hybrid" as const, label: "Hybrid", icon: PhoneForwarded, desc: "Both directions" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAgentMode(opt.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    agentMode === opt.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  )}
                >
                  <opt.icon className={cn("h-4 w-4 mb-1", agentMode === opt.value ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Provider (Retell/Append) */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Voice Provider</h3>
            <p className="text-xs text-muted-foreground">Your agent is powered by Append.</p>
            <div className="space-y-3">
              <RetellAgentManager
                retellAgentId={retellAgentId}
                onAgentIdChange={setRetellAgentId}
                personaName={personaName}
                voiceId={selectedVoice !== "maya" ? selectedVoice : undefined}
                language={agentLanguage}
              />
              {trustedNumbers.length === 0 && (
                <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">⚠ Outbound number required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Append (Retell) requires a verified outbound phone number. Add one in{" "}
                    <span className="font-medium text-foreground">Settings → Phone Numbers</span> before testing.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Call Ending / Transfer */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Call Ending
            </h3>
            <p className="text-xs text-muted-foreground">Choose what happens when your agent finishes the conversation.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => setTransferEnabled(false)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  !transferEnabled ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">End call normally</p>
                <p className="text-xs text-muted-foreground">Agent wraps up and hangs up</p>
              </button>
              <button
                onClick={() => setTransferEnabled(true)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  transferEnabled ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-foreground">Transfer to live agent</p>
                <p className="text-xs text-muted-foreground">Transfers qualified callers to a phone number</p>
              </button>
            </div>
            {transferEnabled && (
              <div className="space-y-2">
                <Label>Transfer Phone Number</Label>
                <Input
                  value={transferPhone}
                  onChange={(e) => setTransferPhone(e.target.value)}
                  placeholder="e.g. (555) 123-4567"
                  type="tel"
                />
              </div>
            )}
          </div>

          {/* Voice Selection */}
          <div className="surface-elevated rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" /> Voice Selection
            </h3>
            <p className="text-xs text-muted-foreground">Choose a voice for your agent.</p>
            <VoiceSelector
              voices={retellVoices}
              loading={voicesLoading}
              selectedVoice={selectedVoice}
              onSelect={setSelectedVoice}
              sampleText={spec?.opening_line || t.voicePreviewText}
              defaultLanguageFilter={agentLanguage !== "en" ? agentLanguage : undefined}
              onRefreshVoices={refetchVoices}
            />
            {selectedVoice === "custom" && (
              <div className="space-y-2">
                <Label>Custom Voice Clone ID</Label>
                <Input
                  value={customVoiceId}
                  onChange={(e) => setCustomVoiceId(e.target.value)}
                  placeholder="e.g. abc123-voice-clone-id"
                />
              </div>
            )}
          </div>

          {showRawSpec && (
            <div className="surface-elevated rounded-xl p-4">
              <Textarea value={rawSpecText} onChange={(e) => setRawSpecText(e.target.value)} rows={14} className="font-mono text-xs" />
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowRawSpec(!showRawSpec)}>
            {showRawSpec ? <Eye className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
            {showRawSpec ? "View Summary" : "Edit Details"}
          </Button>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {t.backBtn}
            </Button>
            <Button onClick={handleSaveAgent} disabled={saving} className="flex-1" size="lg">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t.saveBtn}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="surface-elevated rounded-lg p-4 flex items-start gap-3">
      <div className="text-primary mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="text-sm text-foreground mt-1">{value}</p>
      </div>
    </div>
  );
}
