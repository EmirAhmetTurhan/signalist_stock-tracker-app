// app/api/chat/route.ts — AI Agent endpoint (dynamic multi-model + streaming + DB persistence)
import { streamText, convertToModelMessages, generateText, stepCountIs } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { tools } from '@/lib/ai/tools';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

// ---- Providers ----

const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

// OpenRouter client: custom fetch wrapper ensures required headers (HTTP-Referer, X-Title)
// are injected into every request. The @ai-sdk/openai headers option may not forward
// arbitrary custom headers to the provider, so we wrap fetch instead.
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

const LOCAL_MODEL = process.env.AI_MODEL || 'qwen3:14b';

// ---- Helpers ----

function normalizeParts(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw === 'string') return [{ type: 'text', text: raw }];
  return [];
}

function extractPartsFromMsg(msg: Record<string, unknown>): Record<string, unknown>[] {
  // AI SDK v6 uses `.parts`, but some versions/transports send `.content` instead
  const parts = normalizeParts(msg.parts ?? msg.content);
  if (parts.length === 0 && typeof msg.content === 'string') {
    return [{ type: 'text', text: msg.content }];
  }
  return parts;
}

async function saveMsg(conversationId: string, role: 'user' | 'assistant' | 'tool', parts: Record<string, unknown>[]) {
  if (parts.length === 0) {
    console.warn('[AI Chat] saveMsg skipped: empty parts', { conversationId, role });
    return;
  }
  try {
    const { saveMessage } = await import('@/lib/actions/chat-history.actions');
    const result = await saveMessage(conversationId, role, parts);
    if (!result.success) {
      console.error('[AI Chat] saveMessage basarisiz:', result.error, { conversationId, role, partsCount: parts.length });
    }
  } catch (e) {
    console.error('[AI Chat] Message save exception:', e);
  }
}

function extractUserMessageText(msg: Record<string, unknown>): string {
  if (typeof msg.content === 'string') return msg.content;
  const parts = msg.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join(' ')
      .slice(0, 500);
  }
  return '';
}

async function generateSmartTitle(model: any, conversationId: string, userMessage: string) {
  try {
    const result = await generateText({
      model,
      prompt: `Summarize this message into a maximum 3-word stock-market-focused conversation title. Output ONLY the title, no punctuation, no quotes, no explanation:\n\n"${userMessage}"`,
      temperature: 0.2,
      maxOutputTokens: 256,
      maxRetries: 1,
    });
    const title = result.text.trim().slice(0, 100);
    if (title) {
      const { updateConversationTitle } = await import('@/lib/actions/chat-history.actions');
      await updateConversationTitle(conversationId, title);
    }
  } catch (e) {
    console.error('[SmartTitle] Failed:', e);
  }
}

// ---- Dynamic model resolver ----
// selectedModel format: "provider:modelId"
//   ollama:qwen3:14b          → local Ollama
//   groq:llama-3.3-70b        → Groq (env GROQ_API_KEY)
//   openrouter:meta-llama/... → OpenRouter (env OPENROUTER_API_KEY)
//   groq-key:llama-3.3-70b    → Groq (user's own API key from body)
//   openai-key:gpt-4o         → OpenAI (user's own API key from body)

function resolveModel(selectedModel?: string, userApiKey?: string) {
  // Parse "provider:modelId" format
  if (selectedModel && selectedModel.includes(':')) {
    const colonIdx = selectedModel.indexOf(':');
    const prefix = selectedModel.slice(0, colonIdx);
    const modelId = selectedModel.slice(colonIdx + 1);

    // ── Local Ollama ──
    if (prefix === 'ollama') {
      return { model: ollama(modelId), provider: 'ollama' as const, modelId };
    }

    // ── Groq (env key) ──
    if (prefix === 'groq') {
      if (!process.env.GROQ_API_KEY?.trim()) {
        console.warn('[AI] Groq requested but GROQ_API_KEY not set. Falling back to Ollama.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback' as const, modelId: LOCAL_MODEL };
      }
      return { model: groq(modelId), provider: 'groq' as const, modelId };
    }

    // ── OpenRouter (env key) ──
    if (prefix === 'openrouter') {
      if (!process.env.OPENROUTER_API_KEY?.trim()) {
        console.warn('[AI] OpenRouter requested but OPENROUTER_API_KEY not set. Falling back to Ollama.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback' as const, modelId: LOCAL_MODEL };
      }
      return { model: openrouter(modelId), provider: 'openrouter' as const, modelId };
    }

    // ── User-provided API keys ──
    if (prefix === 'groq-key' || prefix === 'openai-key' || prefix === 'openrouter-key') {
      if (!userApiKey?.trim()) {
        console.warn('[AI] User API key required but not provided.');
        return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback' as const, modelId: LOCAL_MODEL };
      }

      if (prefix === 'groq-key') {
        const client = createGroq({ apiKey: userApiKey });
        return { model: client(modelId), provider: 'groq-user' as const, modelId };
      }
      if (prefix === 'openai-key' || prefix === 'openrouter-key') {
        const client = createOpenAI({ apiKey: userApiKey });
        return { model: client(modelId), provider: 'openai-user' as const, modelId };
      }
    }
  }

  // Legacy: contains "/" without prefix → OpenRouter
  if (selectedModel && selectedModel.includes('/')) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return { model: ollama(LOCAL_MODEL), provider: 'ollama-fallback' as const, modelId: LOCAL_MODEL };
    }
    return { model: openrouter(selectedModel), provider: 'openrouter' as const, modelId: selectedModel };
  }

  // Default: local Ollama
  return { model: ollama(LOCAL_MODEL), provider: 'ollama' as const, modelId: LOCAL_MODEL };
}

// ---- Logging ----

const LOG = (step: string, status: 'OK' | 'ERROR' | 'INFO', detail?: string) => {
  const ts = new Date().toISOString().slice(11, 23);
  const tag = status === 'ERROR' ? '[HATA]' : status === 'OK' ? '[OK]' : '[BILGI]';
  console.log(`${ts} ${tag} ${step}${detail ? ` — ${detail}` : ''}`);
};

// ---- Route ----

export async function POST(req: Request) {
  const reqStart = Date.now();
  LOG('Istek APIye ulasti', 'INFO');

  let modelId = LOCAL_MODEL;
  let provider = 'ollama';

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !session.user) {
      LOG('Yetkilendirme basarisiz', 'ERROR', 'Session yok');
      return new Response('Unauthorized', { status: 401 });
    }
    LOG('Yetkilendirme basarili', 'OK', `userId=${session.user.id.slice(0, 8)}...`);

    const body = await req.json();
    const messages = body.messages;
    const conversationId: string = body.conversationId || req.headers.get('X-Conversation-Id') || '';
    const selectedModel: string | undefined = body.selectedModel;
    const userApiKey: string | undefined = body.apiKey;
    const lastMsg = messages[messages.length - 1];

    const resolved = resolveModel(selectedModel, userApiKey);
    modelId = resolved.modelId;
    provider = resolved.provider;
    const model = resolved.model;
    LOG('Model secildi', 'OK', `${provider}/${modelId}`);

    LOG('Istek govdesi cozuldu', 'OK', `mesajSayisi=${messages.length}, convId=${conversationId || 'yok'}`);

    const recentMessages = messages.slice(-6);
    const modelMessages = await convertToModelMessages(recentMessages);
    LOG('Mesajlar model formatina cevrildi', 'OK');

    // Save user message to DB
    if (conversationId && lastMsg?.role === 'user') {
      await saveMsg(conversationId, 'user', extractPartsFromMsg(lastMsg));
      LOG('Kullanici mesaji DB ye kaydedildi', 'OK');
    }

    // Smart title (use the selected model, not hardcoded Ollama)
    if (conversationId && messages.length === 1 && lastMsg?.role === 'user') {
      const text = extractUserMessageText(lastMsg);
      if (text) {
        generateSmartTitle(model, conversationId, text).then(() => {
          LOG('Akilli baslik uretildi', 'OK');
        }).catch((e) => {
          LOG('Akilli baslik hatasi', 'ERROR', String(e));
        });
      }
    }

    // DB save logic
    let responseSaved = false;
    const saveResponse = async (response: { messages: Array<{ role: string; content: unknown }> }) => {
      if (responseSaved) return;
      responseSaved = true;
      LOG('AI yaniti DB ye kaydediliyor', 'INFO', `parcaSayisi=${response.messages.length}`);

      const toolNames: Record<string, string> = {};
      for (const msg of response.messages) {
        if (msg.content && Array.isArray(msg.content)) {
          for (const p of msg.content) {
            if ((p as any).type === 'tool-call' && (p as any).toolCallId && (p as any).toolName) {
              toolNames[(p as any).toolCallId] = (p as any).toolName;
            }
          }
        }
      }

      for (const msg of response.messages) {
        const role = msg.role || 'assistant';
        const parts = extractPartsFromMsg(msg);
        for (const p of parts) {
          if (p.type === 'tool-result' && p.toolCallId && !p.toolName) {
            p.toolName = toolNames[p.toolCallId as string] || 'unknown-tool';
          }
        }
        if (parts.length > 0) {
          await saveMsg(conversationId, role as 'user' | 'assistant' | 'tool', parts);
        }
      }
      LOG('AI yaniti DB ye kaydedildi', 'OK', `${Date.now() - reqStart}ms`);
    };

    LOG('AI modeline istek gonderiliyor', 'INFO', `model=${modelId}`);
    const streamStart = Date.now();

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      maxRetries: 1,
      temperature: 0.3,
      onFinish: async ({ response, finishReason }) => {
        LOG('AI sonucu uretti', 'OK', `sebep=${finishReason}, sure=${Date.now() - streamStart}ms`);
        if (!conversationId) return;
        await saveResponse(response as { messages: Array<{ role: string; content: unknown }> });
      },
    });

    if (conversationId) {
      void Promise.resolve(result.response)
        .then((response) => saveResponse(response as { messages: Array<{ role: string; content: unknown }> }))
        .catch((e: unknown) => { LOG('Yedek DB kaydi hatasi', 'ERROR', String(e)); });
    }

    LOG('Stream yaniti frontende gonderiliyor', 'OK', `${Date.now() - reqStart}ms`);
    return result.toUIMessageStreamResponse({
      headers: conversationId ? { 'X-Conversation-Id': conversationId } : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    LOG('Istek sirasinda hata', 'ERROR', `${msg} (${Date.now() - reqStart}ms)`);

    // Detailed server-side logging for debugging provider errors
    if (msg.includes('Provider returned error') || msg.includes('attempts')) {
      console.error('══════════════════════════════════════════');
      console.error('[OpenRouter Debug] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      console.error('[OpenRouter Debug] Stack:', stack);
      console.error('[OpenRouter Debug] Model:', modelId);
      console.error('[OpenRouter Debug] Provider:', provider);
      if (process.env.OPENROUTER_API_KEY) {
        const masked = process.env.OPENROUTER_API_KEY.slice(0, 8) + '...' + process.env.OPENROUTER_API_KEY.slice(-4);
        console.error('[OpenRouter Debug] API Key (masked):', masked);
      } else {
        console.error('[OpenRouter Debug] API Key: MISSING');
      }
      console.error('══════════════════════════════════════════');
    }

    let userMessage = 'AI service is currently unavailable. Please try again.';
    let statusCode = 500;
    if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused') || msg.includes('fetch failed')) {
      userMessage = 'Cannot connect to AI model. Make sure the service is running.';
    } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
      userMessage = 'Invalid API key. Please check your OpenRouter API key at https://openrouter.ai/keys.';
      statusCode = 401;
    } else if (msg.includes('402') || msg.includes('Payment Required') || msg.includes('Insufficient credits')) {
      userMessage = 'API credits exhausted. Please check your OpenRouter account at https://openrouter.ai/credits.';
      statusCode = 402;
    } else if (msg.includes('TIMEOUT') || msg.includes('timeout')) {
      userMessage = 'AI request timed out. The model may be overloaded.';
    } else if (msg.includes('rate') || msg.includes('RATE_LIMIT') || msg.includes('429')) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
      statusCode = 429;
    } else if (msg.includes('Provider returned error')) {
      userMessage = `OpenRouter error: ${msg}. Check terminal logs for full details.`;
      statusCode = 502;
    }

    return new Response(
      JSON.stringify({ error: userMessage, detail: msg }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
