// Unified AI client that routes to Lovable AI Gateway (Gemini) or Anthropic (Claude)

type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type AIToolChoice = {
  type: "function";
  function: { name: string };
};

type CallAIOptions = {
  provider: "gemini" | "claude";
  model?: string;
  messages: AIMessage[];
  tools?: AITool[];
  tool_choice?: AIToolChoice;
  temperature?: number;
  max_tokens?: number;
};

type AIResponse = {
  content: string | null;
  tool_calls: { name: string; arguments: Record<string, unknown> }[];
  raw: unknown;
};

const DEFAULT_MODELS = {
  gemini: "google/gemini-3-pro-preview",
  claude: "claude-sonnet-4-20250514",
} as const;

export async function callAI(options: CallAIOptions): Promise<AIResponse> {
  const { provider, messages, tools, tool_choice, temperature, max_tokens } = options;
  const model = options.model || DEFAULT_MODELS[provider];

  if (provider === "gemini") {
    return callGemini({ model, messages, tools, tool_choice, temperature, max_tokens });
  } else {
    return callClaude({ model, messages, tools, tool_choice, temperature, max_tokens });
  }
}

// ── Lovable AI Gateway (Gemini / OpenAI-compatible) ──

async function callGemini(opts: Omit<CallAIOptions, "provider">): Promise<AIResponse> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.max_tokens !== undefined) {
    body.max_completion_tokens = opts.max_tokens;
    body.max_tokens = opts.max_tokens;
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini gateway error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0]?.message;

  return {
    content: choice?.content || null,
    tool_calls: (choice?.tool_calls || []).map((tc: any) => ({
      name: tc.function.name,
      arguments: typeof tc.function.arguments === "string"
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments,
    })),
    raw: data,
  };
}

// ── Anthropic API (Claude) ──

async function callClaude(opts: Omit<CallAIOptions, "provider">): Promise<AIResponse> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  // Convert OpenAI-style messages to Anthropic format
  const systemMsg = opts.messages.find((m) => m.role === "system");
  const nonSystemMsgs = opts.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: opts.max_tokens || 4096,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  // Convert OpenAI-style tools to Anthropic format
  if (opts.tools) {
    body.tools = opts.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  if (opts.tool_choice) {
    body.tool_choice = { type: "tool", name: opts.tool_choice.function.name };
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();

  // Extract text content and tool uses from Anthropic response
  const textBlocks = (data.content || []).filter((b: any) => b.type === "text");
  const toolBlocks = (data.content || []).filter((b: any) => b.type === "tool_use");

  return {
    content: textBlocks.map((b: any) => b.text).join("") || null,
    tool_calls: toolBlocks.map((b: any) => ({
      name: b.name,
      arguments: b.input,
    })),
    raw: data,
  };
}
