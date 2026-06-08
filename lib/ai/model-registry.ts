// lib/ai/model-registry.ts — All AI model definitions
// Local models (Ollama) + Bring-your-own-key providers

export type ModelProvider = 'ollama' | 'openai' | 'deepseek' | 'groq' | 'google';

export interface ModelEntry {
  id: string;
  label: string;
  description: string;
  requiresApiKey: boolean;
  provider: ModelProvider;
}

export interface ProviderInfo {
  key: ModelProvider;
  title: string;
  description: string;
  baseURL?: string;
  models: ModelEntry[];
}

// ─── Local (no API key needed) ──────────────────────────────────────────────

const LOCAL_MODELS: ModelEntry[] = [
  { id: 'ollama:qwen3:14b', label: 'Qwen 3 14B', description: 'Local — no key needed', requiresApiKey: false, provider: 'ollama' },
];

// ─── Bring-your-own-key providers ───────────────────────────────────────────

export const API_KEY_PROVIDERS: ProviderInfo[] = [
  {
    key: 'openai',
    title: 'OpenAI',
    description: 'GPT-4o, GPT-4.1, O4 Mini',
    baseURL: 'https://api.openai.com/v1',
    models: [
      { id: 'openai:gpt-4o', label: 'GPT-4o', description: 'Fast & capable', requiresApiKey: true, provider: 'openai' },
      { id: 'openai:gpt-4.1', label: 'GPT-4.1', description: 'Latest flagship', requiresApiKey: true, provider: 'openai' },
      { id: 'openai:o4-mini', label: 'O4 Mini', description: 'Fast reasoning', requiresApiKey: true, provider: 'openai' },
    ],
  },
  {
    key: 'deepseek',
    title: 'DeepSeek',
    description: 'V3, R1 reasoning',
    baseURL: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek:deepseek-chat', label: 'DeepSeek V3', description: 'Fast chat model', requiresApiKey: true, provider: 'deepseek' },
      { id: 'deepseek:deepseek-reasoner', label: 'DeepSeek R1', description: 'Deep reasoning', requiresApiKey: true, provider: 'deepseek' },
    ],
  },
  {
    key: 'groq',
    title: 'Groq',
    description: 'Fast inference — Llama 4',
    baseURL: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'groq:llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', description: 'Fast & free tier', requiresApiKey: true, provider: 'groq' },
    ],
  },
  {
    key: 'google',
    title: 'Google AI',
    description: 'Gemini 2.5 Flash/Pro',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast multimodal', requiresApiKey: true, provider: 'google' },
      { id: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Deep reasoning', requiresApiKey: true, provider: 'google' },
    ],
  },
];

// ─── Combined list ──────────────────────────────────────────────────────────

export const MODEL_CATEGORIES = [
  { key: 'ollama', title: 'Local AI', models: LOCAL_MODELS },
];

export function findModelById(id: string): ModelEntry | undefined {
  for (const cat of MODEL_CATEGORIES) {
    const found = cat.models.find((m) => m.id === id);
    if (found) return found;
  }
  for (const p of API_KEY_PROVIDERS) {
    const found = p.models.find((m) => m.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getAllModels(): ModelEntry[] {
  return [
    ...MODEL_CATEGORIES.flatMap((c) => c.models),
    ...API_KEY_PROVIDERS.flatMap((p) => p.models),
  ];
}
