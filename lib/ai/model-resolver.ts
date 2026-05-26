// lib/ai/model-resolver.ts — Single source of truth for AI model resolution
// Used by both route.ts (smart title) and chat-async.ts (main AI processing)

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';

export const LOCAL_MODEL = process.env.AI_MODEL || 'qwen3:14b';

const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

const openrouterFetch: typeof fetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  headers.set('HTTP-Referer', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  headers.set('X-Title', 'Signalist');
  return fetch(url, { ...init, headers });
};

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  fetch: openrouterFetch,
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || '',
});

export type ResolvedModel = {
  model: ReturnType<typeof ollama>;
  provider: string;
  modelId: string;
};

/**
 * Resolves a model from a "provider:modelId" string.
 * Handles: ollama, groq, openrouter, groq-key, openai-key, openrouter-key
 * Falls back to local Ollama if env keys are missing.
 */
export function resolveModel(selectedModel?: string, userApiKey?: string): ResolvedModel {
  if (selectedModel && selectedModel.includes(':')) {
    const colonIdx = selectedModel.indexOf(':');
    const prefix = selectedModel.slice(0, colonIdx);
    const modelId = selectedModel.slice(colonIdx + 1);

    if (prefix === 'ollama') {
      return { model: ollama(modelId), provider: 'ollama', modelId };
    }

    if (prefix === 'groq') {
      if (!process.env.GROQ_API_KEY?.trim()) {
        console.warn('[AI] Groq requested but GROQ_API_KEY not set. Falling back to Ollama.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback', modelId: LOCAL_MODEL };
      }
      return { model: groq(modelId), provider: 'groq', modelId };
    }

    if (prefix === 'openrouter') {
      if (!process.env.OPENROUTER_API_KEY?.trim()) {
        console.warn('[AI] OpenRouter requested but OPENROUTER_API_KEY not set. Falling back to Ollama.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback', modelId: LOCAL_MODEL };
      }
      return { model: openrouter(modelId), provider: 'openrouter', modelId };
    }

    if (prefix === 'groq-key' || prefix === 'openai-key' || prefix === 'openrouter-key') {
      if (!userApiKey?.trim()) {
        console.warn('[AI] User API key required but not provided.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback', modelId: LOCAL_MODEL };
      }

      if (prefix === 'groq-key') {
        const client = createGroq({ apiKey: userApiKey });
        return { model: client(modelId), provider: 'groq-user', modelId };
      }
      // openai-key and openrouter-key both use OpenAI-compatible API
      const client = createOpenAI({ apiKey: userApiKey });
      return { model: client(modelId), provider: 'openai-user', modelId };
    }
  }

  // Legacy: contains "/" without prefix → OpenRouter
  if (selectedModel && selectedModel.includes('/')) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback', modelId: LOCAL_MODEL };
    }
    return { model: openrouter(selectedModel), provider: 'openrouter', modelId: selectedModel };
  }

  // Default: local Ollama
  return { model: ollama(LOCAL_MODEL), provider: 'ollama', modelId: LOCAL_MODEL };
}
