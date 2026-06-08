// lib/ai/model-resolver.ts — AI model resolution with user API key support
// Supports: ollama (local), openai, deepseek, groq, google (user key required)

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';

export const LOCAL_MODEL = process.env.AI_MODEL || 'qwen3:14b';

const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

export type ResolvedModel = {
  model: ReturnType<typeof ollama>;
  provider: string;
  modelId: string;
};

function createUserClient(provider: string, apiKey: string, modelId: string): ResolvedModel {
  switch (provider) {
    case 'groq': {
      const client = createGroq({ apiKey });
      return { model: client(modelId), provider: 'groq-user', modelId };
    }
    case 'deepseek': {
      // DeepSeek uses OpenAI-compatible API
      const client = createOpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' });
      return { model: client(modelId), provider: 'deepseek-user', modelId };
    }
    case 'google': {
      // Google Gemini via OpenAI-compatible endpoint
      const client = createOpenAICompatible({
        name: 'google',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey,
      });
      return { model: client(modelId), provider: 'google-user', modelId };
    }
    case 'openai':
    default: {
      const client = createOpenAI({ apiKey });
      return { model: client(modelId), provider: 'openai-user', modelId };
    }
  }
}

/**
 * Resolves a model from "provider:modelId" format.
 * Local Ollama needs no key. Cloud providers require user API key from localStorage.
 * Falls back to local Ollama if requirements not met.
 */
export function resolveModel(selectedModel?: string, userApiKey?: string): ResolvedModel {
  if (!selectedModel || !selectedModel.includes(':')) {
    return { model: ollama(LOCAL_MODEL), provider: 'ollama', modelId: LOCAL_MODEL };
  }

  const colonIdx = selectedModel.indexOf(':');
  const prefix = selectedModel.slice(0, colonIdx);
  const modelId = selectedModel.slice(colonIdx + 1);

  // Local — no key needed
  if (prefix === 'ollama') {
    return { model: ollama(modelId), provider: 'ollama', modelId };
  }

  // Cloud providers — user API key required
  if (['openai', 'deepseek', 'groq', 'google'].includes(prefix)) {
    if (!userApiKey?.trim()) {
      console.warn(`[AI] ${prefix} requested but no API key provided.`);
      return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback', modelId: LOCAL_MODEL };
    }
    return createUserClient(prefix, userApiKey, modelId);
  }

  // Fallback
  return { model: ollama(LOCAL_MODEL), provider: 'ollama', modelId: LOCAL_MODEL };
}
