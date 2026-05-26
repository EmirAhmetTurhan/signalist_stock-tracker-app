// app/api/chat/route.ts — AI Agent endpoint (Async Inngest Dispatch + DB persistence)
import { generateText } from 'ai';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { resolveModel } from '@/lib/ai/model-resolver';

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
    const modelId = resolved.modelId;
    const provider = resolved.provider;
    const model = resolved.model;
    
    LOG('Model secildi', 'OK', `${provider}/${modelId}`);
    LOG('Istek govdesi cozuldu', 'OK', `convId=${conversationId || 'yok'}`);

    // Save user message to DB first
    if (conversationId && lastMsg?.role === 'user') {
      await saveMsg(conversationId, 'user', extractPartsFromMsg(lastMsg));
      LOG('Kullanici mesaji DB ye kaydedildi', 'OK');
    }

    // Smart title - using a faster model like flash if possible, or sticking with current for now
    if (conversationId && messages.length === 1 && lastMsg?.role === 'user') {
      const text = extractUserMessageText(lastMsg);
      if (text) {
        // We still use the selected model for the title for now
        generateSmartTitle(model, conversationId, text).then(() => {
          LOG('Akilli baslik uretildi', 'OK');
        }).catch((e) => {
          LOG('Akilli baslik hatasi', 'ERROR', String(e));
        });
      }
    }

    // Connect DB to create AIJob
    const { connectToDatabase } = await import('@/database/mongoose');
    await connectToDatabase();
    
    const { default: AIJob } = await import('@/database/models/ai-job.model');
    const { inngest } = await import('@/lib/inngest/client');

    const jobId = crypto.randomUUID();

    await AIJob.create({
      jobId,
      userId: session.user.id,
      type: 'process_chat_message',
      status: 'queued',
      title: 'Yapay Zeka Yanıt Üretiyor',
      source: 'chat',
      conversationId: conversationId,
      progress: 0,
      steps: [{ name: 'İstek alındı', status: 'completed', completedAt: new Date() }]
    });

    LOG('AIJob olusturuldu', 'OK', `jobId=${jobId}`);

    // Dispatch Inngest Event - No longer sending messages, only IDs
    await inngest.send({
      name: 'ai/process-chat-message',
      data: {
        jobId,
        conversationId,
        userId: session.user.id,
        selectedModel,
        userApiKey
      }
    });

    LOG('Inngest arka plan islemi baslatildi', 'OK', `jobId=${jobId}, sure=${Date.now() - reqStart}ms`);

    return Response.json({
      success: true,
      jobId,
      conversationId
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
