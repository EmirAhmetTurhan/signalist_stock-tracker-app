// lib/ai/model-registry.ts — Single source of truth for all AI model definitions
// Each entry maps to a provider prefix resolved by route.ts resolveModel()

export type ModelProvider = 'ollama' | 'groq' | 'openrouter' | 'groq-key' | 'openai-key' | 'openrouter-key';

export interface ModelEntry {
  id: string;           // "provider:modelId" (e.g. "ollama:qwen3:14b")
  label: string;         // Display name
  description: string;   // One-line hint
  requiresApiKey: boolean;
}

export const MODEL_CATEGORIES: { key: string; title: string; models: ModelEntry[] }[] = [
  {
    key: 'ollama',
    title: 'Lokal Ollama (ucretsiz, offline)',
    models: [
      { id: 'ollama:qwen3:14b',           label: 'Qwen 3 14B',      description: 'Dengeli (onerilen)',    requiresApiKey: false },
      { id: 'ollama:llama3.2:3b',         label: 'Llama 3.2 3B',    description: 'Hafif / Hizli',          requiresApiKey: false },
      { id: 'ollama:qwen3:30b',           label: 'Qwen 3 30B',      description: 'Guclu (24GB+ RAM)',      requiresApiKey: false },
    ],
  },
  {
    key: 'groq',
    title: 'Groq Cloud (ucretsiz tier, kendi kotan)',
    models: [
      { id: 'groq:llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: 'En zeki & hizli',       requiresApiKey: true },
      { id: 'groq:llama-3.1-8b-instant',     label: 'Llama 3.1 8B',  description: 'Anlik yanit',            requiresApiKey: true },
    ],
  },
  {
    key: 'openrouter',
    title: 'OpenRouter (ucretsiz tier, paylasimli)',
    models: [
      { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', description: 'Yogun olabilir', requiresApiKey: true },
      { id: 'openrouter:qwen/qwen3-next-80b-a3b-instruct:free',  label: 'Qwen 3 Next 80B', description: 'Yedek',        requiresApiKey: true },
    ],
  },
];

export function findModelById(id: string): ModelEntry | undefined {
  for (const cat of MODEL_CATEGORIES) {
    const found = cat.models.find((m) => m.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getAllModels(): ModelEntry[] {
  return MODEL_CATEGORIES.flatMap((c) => c.models);
}
