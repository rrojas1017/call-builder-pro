
# Language-First Wizard: Full Localization from Step 1

## What's Being Fixed

The user correctly identified two problems:
1. The voice preview sample text ("Hello, this is a voice sample…") is always in English — useless for testing a Spanish-speaking agent.
2. The entire wizard (questions, labels, placeholders, button text, spec content) is generated in English even when the agent is intended for Spanish-speaking callers.

## Solution Overview

Add a **language selector at the very top of Step 1** (before the agent name), so the user picks their operating language first. Everything downstream then adapts:

- The wizard UI labels, placeholders, and button text switch to that language
- The AI spec generation prompts the model to return questions and spec content in that language
- The voice preview sample text becomes a phrase in that language
- The voice selector automatically pre-filters to voices matching that language

---

## Supported Languages (initial set)

| Code | Display Name |
|------|-------------|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `pt` | Portuguese |
| `de` | German |
| `it` | Italian |

More can be added easily later.

---

## Changes by File

### 1. `src/pages/CreateAgentPage.tsx`

**Add `agentLanguage` state** (default `"en"`):
```ts
const [agentLanguage, setAgentLanguage] = useState("en");
```

**Add a language picker UI block at the very top of Step 0** — before Agent Name. Uses flag + language name buttons in a pill-style selector.

**Pass `language` to `generate-spec`** when calling the edge function:
```ts
supabase.functions.invoke("generate-spec", { 
  body: { project_id: project.id, language: agentLanguage } 
})
```

**Switch all wizard UI strings** based on `agentLanguage` using a compact `t()` translation helper defined within the file (no external i18n library needed). Labels, placeholders, button text, step names, and toasts all adapt.

**Pass `agentLanguage` as `sampleText` language hint to `VoiceSelector`** so the preview text is in the right language.

**Auto-pre-filter voices by language** in Step 3's `VoiceSelector` by passing a `defaultLanguageFilter` prop.

**Save language to `agent_specs`** via the existing `language` column when saving the agent.

### 2. `src/components/VoiceSelector.tsx`

**Add optional `defaultLanguageFilter` prop**:
```ts
interface VoiceSelectorProps {
  ...
  defaultLanguageFilter?: string;  // NEW
}
```

Initialize `languageFilter` state from this prop so when arriving at Step 3, voices are already filtered to the chosen language:
```ts
const [languageFilter, setLanguageFilter] = useState(defaultLanguageFilter ?? "all");
```

### 3. `supabase/functions/generate-spec/index.ts`

**Accept `language` in the request body**:
```ts
const { project_id, language } = await req.json();
const lang = language || "en";
```

**Inject the language requirement into the AI system prompt**:
```
- You MUST write ALL questions, answers, suggested defaults, opening lines, tone descriptions, 
  and spec fields in ${languageLabel}. Not in English.
- The opening_line must be a natural-sounding greeting in ${languageLabel}.
- The suggested_default answers must be written in ${languageLabel}.
```

**Store `language` on the spec row** (the column already exists):
```ts
specRow.language = lang;
```

**Update the fallback hardcoded questions** to also reference the language so they get passed correctly when AI is unavailable.

---

## Translation Strings (in-file `t()` helper)

A lightweight object-based translation map — no external library — covering all visible wizard text:

```ts
const TRANSLATIONS = {
  en: {
    step0Title: "Build Your AI Call Agent",
    agentNameLabel: "Agent Name",
    agentNamePlaceholder: "e.g. Health Insurance Pre-Qualifier",
    whatShouldDo: "What should your agent do?",
    generateBtn: "Generate My Agent",
    websiteLabel: "Company or product website (optional)",
    uploadLabel: "Or upload a document (.txt, .docx, .pdf)",
    step1Title: "Let's Make It Work Perfectly",
    step1Sub: "Answer a few quick questions so your agent performs correctly.",
    useDefaultsBtn: "Review Defaults",
    confirmBtn: "Confirm & Review",
    voicePreviewText: "Hello! I'm calling to help you find the best option for your needs. Do you have a moment?",
    // ...
  },
  es: {
    step0Title: "Crea tu Agente de Llamadas con IA",
    agentNameLabel: "Nombre del Agente",
    agentNamePlaceholder: "ej. Pre-calificador de Seguros de Salud",
    whatShouldDo: "¿Qué debe hacer tu agente?",
    generateBtn: "Generar Mi Agente",
    websiteLabel: "Sitio web de la empresa o producto (opcional)",
    uploadLabel: "O sube un documento (.txt, .docx, .pdf)",
    step1Title: "Vamos a Perfeccionarlo",
    step1Sub: "Responde unas preguntas rápidas para que tu agente funcione correctamente.",
    useDefaultsBtn: "Revisar Valores Predeterminados",
    confirmBtn: "Confirmar y Revisar",
    voicePreviewText: "¡Hola! Le llamo para ayudarle a encontrar la mejor opción para sus necesidades. ¿Tiene un momento?",
    // ...
  },
  // fr, pt, de, it...
}
```

---

## Voice Preview Sample Text

`VoicePlayButton` already accepts a `sampleText` prop. The `VoiceSelector` already passes `sampleText` down to each `VoicePlayButton`. 

Currently `CreateAgentPage` passes `spec?.opening_line` as `sampleText` in Step 3. Since `generate-spec` will now return `opening_line` in the chosen language, this automatically becomes a natural-language preview in the correct language — no changes needed to `VoicePlayButton` itself.

For the fallback before a spec exists, we use the language-specific `voicePreviewText` from the translation map.

---

## Language Picker UI (Step 1, top)

```
┌──────────────────────────────────────────┐
│  Agent Language                          │
│                                          │
│  🇺🇸 English  🇪🇸 Español  🇫🇷 Français   │
│  🇧🇷 Português  🇩🇪 Deutsch  🇮🇹 Italiano  │
└──────────────────────────────────────────┘
```

Pill-style toggle buttons with flag emoji + language name. Selecting a language immediately re-renders all Step 1 UI text.

---

## What Does NOT Change

- No external i18n library (react-i18next etc.) — kept simple with an in-file translation map
- No database schema changes — the `language` column already exists on `agent_specs`
- The `save-wizard-answers` keyword matching still works because it checks question content keywords, and the AI will generate questions in the target language — the keyword mapping in `save-wizard-answers` should be extended to cover Spanish/French equivalents of words like "empresa", "tono", "cumplimiento" etc.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/pages/CreateAgentPage.tsx` | Language state, language picker UI, translated strings, pass language to spec generation and voice selector |
| `src/components/VoiceSelector.tsx` | Accept `defaultLanguageFilter` prop, initialize filter from it |
| `supabase/functions/generate-spec/index.ts` | Accept `language` param, inject into AI prompt, store on spec |
| `supabase/functions/save-wizard-answers/index.ts` | Add Spanish/French/Portuguese keyword variants for mapping |
