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
    title: 'Lokal Yapay Zeka',
    models: [
      { id: 'ollama:qwen3:14b', label: 'Qwen 3 14B', description: 'Mevcut Model', requiresApiKey: false },
    ],
  }
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
