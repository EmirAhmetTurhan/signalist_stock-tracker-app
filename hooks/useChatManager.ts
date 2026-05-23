// hooks/useChatManager.ts — Shared chat logic used by both AI page and FloatingChatButton
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';

const CLIENT_LOG = (step: string, status: 'OK' | 'ERROR' | 'INFO', detail?: string) => {
  const ts = new Date().toISOString().slice(11, 23);
  const tag = status === 'ERROR' ? '[HATA]' : status === 'OK' ? '[OK]' : '[BILGI]';
  console.log(`%c${ts} ${tag} [CLIENT] ${step}${detail ? ' — ' + detail : ''}`,
    status === 'ERROR' ? 'color:red' : status === 'OK' ? 'color:lime' : 'color:cyan');
};

export type ChatManagerOptions = {
  roomKey: string;
  initialConversationId?: string;
  selectedModel?: string;
  onConversationCreated?: (roomKey: string, convId: string) => void;
  onStreamingChange?: (id: string, isStreaming: boolean) => void;
};

export type ChatManagerReturn = {
  messages: UIMessage[];
  setMessages: (msgs: UIMessage[]) => void;
  sendMessage: (opts: { text: string }) => void;
  status: 'idle' | 'streaming' | 'submitted' | 'error' | 'ready';
  isLoading: boolean;
  isHydrating: boolean;
  conversationId: string;
  error: string | null;
  isOffline: boolean;
  hasContent: (m: { role: string; parts?: { type: string; text?: string }[] }) => boolean;
  handleSubmit: (input: string) => Promise<void>;
  addToolOutput: (...args: any[]) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
};

export function useChatManager({
  roomKey,
  initialConversationId = '',
  selectedModel,
  onConversationCreated,
  onStreamingChange,
}: ChatManagerOptions): ChatManagerReturn {
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const hasFetchedRef = useRef(false);
  const creatingRef = useRef(false);
  const pendingRef = useRef(false);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Network status detection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); setError(null); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  const convIdRef = useRef(initialConversationId);
  convIdRef.current = initialConversationId;

  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  // Keep a state copy for the return value (updated after lazy creation)
  const [conversationId, setConversationId] = useState(initialConversationId);
  useEffect(() => { setConversationId(initialConversationId); }, [initialConversationId]);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    headers: (): Record<string, string> => {
      const id = convIdRef.current;
      const h: Record<string, string> = {};
      if (id) h['X-Conversation-Id'] = id;
      return h;
    },
    // Pass selected model and optional user API key to the server
    body: () => {
      const b: Record<string, unknown> = {};
      const m = selectedModelRef.current;
      if (m) b.selectedModel = m;
      // User-provided API key (for groq-key:, openai-key: etc.) from localStorage
      if (typeof window !== 'undefined') {
        try {
          const key = localStorage.getItem('signalist-user-api-key');
          if (key) b.apiKey = key;
        } catch { /* ignore */ }
      }
      return b;
    },
  }), []);

  const { messages, setMessages, sendMessage, status, addToolOutput } = useChat({
    id: roomKey,
    transport,
    // onToolCall KALDIRILDI — AI SDK v3'te bu callback client-side tool execution
    // modunu aktive eder ve addToolOutput bekler. Tool'lar SERVER'da calistigi icin
    // bu modda "Tool result is missing" hatasi aliyorduk.
    // Optimistic UI guncellemeleri artik useEffect ile messages uzerinden yapiliyor.
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      CLIENT_LOG('Stream hatasi alindi', 'ERROR', msg);
      setError(msg);
      import('sonner').then(({ toast }) => toast.error('AI yanit veremedi', {
        description: msg.includes('timeout') || msg.includes('TIMEOUT')
          ? 'Sunucu zaman asimina ugradi, lutfen tekrar deneyin.'
          : 'Bir hata olustu. Lutfen internet baglantinizi kontrol edip tekrar deneyin.',
      }));
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Optimistic UI: watch for tool results in messages and update Zustand
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    for (const part of (lastMsg.parts || [])) {
      const inv = (part as any).toolInvocation;
      if (!inv || inv.state !== 'result') continue;

      const input = inv.input || inv.args;
      if (inv.toolName === 'addToWatchlist' && input) {
        import('@/store/useAppStore').then(({ useAppStore }) => {
          useAppStore.getState().addToWatchlistOptimistic(input.symbol, input.company);
        });
      } else if (inv.toolName === 'removeFromWatchlist' && input) {
        import('@/store/useAppStore').then(({ useAppStore }) => {
          useAppStore.getState().removeFromWatchlistOptimistic(input.symbol);
        });
      } else if (inv.toolName === 'analyzeIndicators' && input) {
        import('@/store/useAppStore').then(({ useAppStore }) => {
          useAppStore.getState().setActiveIndicators(input.indicators || []);
        });
      }
    }
  }, [messages]);

  // Notify parent of streaming changes
  useEffect(() => {
    onStreamingChange?.(conversationId || roomKey, isLoading);
  }, [isLoading, conversationId, roomKey, onStreamingChange]);

  // ---- Hydration ----
  const mapMessages = useCallback((msgs: { role: string; parts: unknown; content?: unknown }[]) =>
    msgs.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as 'user' | 'assistant',
      parts: Array.isArray(m.parts) ? m.parts
        : m.content ? [{ type: 'text', text: String(m.content) }]
        : [],
    })) as unknown as UIMessage[], []);

  useEffect(() => {
    const cid = initialConversationId;
    if (!cid || messages.length > 0 || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    setIsHydrating(true);

    import('@/lib/actions/chat-history.actions')
      .then(({ getConversationMessages }) => getConversationMessages(cid))
      .then((res) => {
        if (res.success && res.messages && res.messages.length > 0) {
          CLIENT_LOG('Hydration: mesajlar DB den yuklendi', 'OK', `sayi=${res.messages.length}`);
          setMessages(mapMessages(res.messages));

          const lastRole = res.messages[res.messages.length - 1]?.role;
          if (lastRole === 'user') {
            let attempts = 0;
            const maxAttempts = 20; // 20 * 3s = 60s timeout
            const initialCount = res.messages.length;
            staleTimerRef.current = setInterval(() => {
              attempts++;
              import('@/lib/actions/chat-history.actions')
                .then(({ getConversationMessages: gcm }) => gcm(cid))
                .then((retry) => {
                  if (retry.success && retry.messages && retry.messages.length > initialCount) {
                    CLIENT_LOG('Polling: AI yaniti DB de bulundu', 'OK', `${retry.messages.length} mesaj`);
                    setMessages(mapMessages(retry.messages));
                    if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null; }
                  } else if (attempts >= maxAttempts) {
                    if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null; }
                  }
                }).catch(() => {
                  if (attempts >= maxAttempts && staleTimerRef.current) {
                    clearInterval(staleTimerRef.current);
                    staleTimerRef.current = null;
                  }
                });
            }, 3000);
          }
        }
      })
      .catch((e) => { console.error('Hydration error:', e); })
      .finally(() => { setIsHydrating(false); });
  }, [initialConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => {
      if (staleTimerRef.current) { clearTimeout(staleTimerRef.current); staleTimerRef.current = null; }
    };
  }, [initialConversationId]);

  // Clear messages + reset fetch flag when conversation changes.
  // GUARD: don't clear if stream is active or messages already exist —
  // otherwise lazy creation races with the optimistic user message and wipes it.
  useEffect(() => {
    hasFetchedRef.current = false;
    if (initialConversationId && !isLoading && messages.length === 0) {
      setMessages([]);
    }
  }, [initialConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-scroll ----
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages, isHydrating]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const checkAtBottom = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    el.addEventListener('scroll', checkAtBottom, { passive: true });
    checkAtBottom();
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', checkAtBottom);
    };
  }, []);

  // Release pending lock when stream ends
  useEffect(() => {
    if (status === 'ready') {
      CLIENT_LOG('Stream tamamlandi (ready)', 'OK');
      pendingRef.current = false;
    } else if (status === 'error') {
      CLIENT_LOG('Stream hataya dustu (error)', 'ERROR');
      pendingRef.current = false;
    } else if (status === 'streaming') {
      CLIENT_LOG('Stream basladi (streaming)', 'OK');
    } else if (status === 'submitted') {
      CLIENT_LOG('Istek gonderildi (submitted)', 'INFO');
    }
  }, [status]);

  // ---- Lazy creation + submit ----
  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isLoading || pendingRef.current || isOffline) {
      if (pendingRef.current) CLIENT_LOG('Gonderim engellendi (pendingRef)', 'INFO');
      if (isOffline) CLIENT_LOG('Gonderim engellendi (offline)', 'INFO');
      return;
    }

    CLIENT_LOG('Kullanici mesaji gonderiliyor', 'INFO', `convId=${convIdRef.current || 'yok'}`);
    pendingRef.current = true;
    let cid = convIdRef.current;

    if (!cid && !creatingRef.current) {
      CLIENT_LOG('Yeni konusma olusturuluyor (lazy)', 'INFO');
      creatingRef.current = true;
      try {
        const { createConversation } = await import('@/lib/actions/chat-history.actions');
        const res = await createConversation(input.slice(0, 80));
        if (res.success && res.conversationId) {
          cid = res.conversationId;
          convIdRef.current = cid;
          setConversationId(cid);
          onConversationCreated?.(roomKey, cid);
          CLIENT_LOG('Yeni konusma olusturuldu', 'OK', `convId=${cid}`);
        }
      } catch (e) { CLIENT_LOG('Konusma olusturma hatasi', 'ERROR', String(e)); }
      creatingRef.current = false;
    }

    isAtBottomRef.current = true;
    sendMessage({ text: input });
    CLIENT_LOG('APIye gonderildi', 'OK');
  }, [isLoading, isOffline, roomKey, onConversationCreated, sendMessage]);

  // ---- hasContent ----
  const hasContent = useCallback((m: any) => {
    if (m.role === 'user') return true;
    
    // AI SDK v3 streams tools via toolInvocations directly on the message object
    if (m.toolInvocations && m.toolInvocations.length > 0) return true;
    
    if (!m.parts) return false;
    const hasText = m.parts.some((p: any) => p.type === 'text' && p.text?.trim());
    const hasTool = m.parts.some((p: any) =>
      p.type === 'tool-call' ||
      p.type === 'tool-result' ||
      p.type === 'tool-invocation'
    );
    return hasText || hasTool;
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    isLoading,
    isHydrating,
    conversationId,
    error,
    isOffline,
    hasContent,
    handleSubmit,
    addToolOutput,
    scrollContainerRef,
    messagesEndRef,
    isAtBottomRef,
  };
}
