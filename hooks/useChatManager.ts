// hooks/useChatManager.ts — Shared chat logic used by both AI page and FloatingChatButton
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getConversationMessages, createConversation } from '@/lib/actions/chat-history.actions';
import { getJobByJobId } from '@/lib/actions/ai-job.actions';
import { normalizeMessage } from '@/lib/ai/message-format';

// ─── Core message types (no more `any`) ────────────────────────────────────

export interface UIMessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  toolInvocation?: unknown;
  output?: unknown;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data' | 'tool';
  content?: string;
  parts?: UIMessagePart[];
}

export interface JobStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  completedAt?: string;
}

export interface ToolOutputInput {
  toolCallId: string;
  toolName: string;
  output: unknown;
}

// ─── Logging helper (dev-only guard) ───────────────────────────────────────

const CLIENT_LOG = (step: string, status: 'OK' | 'ERROR' | 'INFO', detail?: string) => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const ts = new Date().toISOString().slice(11, 23);
    const tag = status === 'ERROR' ? '[ERROR]' : status === 'OK' ? '[OK]' : '[INFO]';
    console.log(`%c${ts} ${tag} [CLIENT] ${step}${detail ? ' — ' + detail : ''}`,
      status === 'ERROR' ? 'color:red' : status === 'OK' ? 'color:lime' : 'color:cyan');
  }
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
  status: 'idle' | 'streaming' | 'running' | 'submitted' | 'error' | 'ready';
  isLoading: boolean;
  isHydrating: boolean;
  conversationId: string;
  error: string | null;
  isOffline: boolean;
  hasContent: (m: UIMessage) => boolean;
  handleSubmit: (input: string) => Promise<void>;
  addToolOutput: (opts: ToolOutputInput) => Promise<void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
  activeJobSteps: JobStep[];
};

// ─── Internal types for DB message normalization ───────────────────────────

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useChatManager({
  roomKey,
  initialConversationId = '',
  selectedModel,
  onConversationCreated,
  onStreamingChange,
}: ChatManagerOptions): ChatManagerReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [activeJobSteps, setActiveJobSteps] = useState<JobStep[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'submitted' | 'error' | 'ready' | 'streaming'>('idle');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const creatingRef = useRef(false);
  const consecutiveErrors = useRef(0);

  const activeJobs = useAppStore(state => state.activeJobs);
  const addActiveJob = useAppStore(state => state.addActiveJob);
  const removeActiveJob = useAppStore(state => state.removeActiveJob);

  const convIdRef = useRef(initialConversationId);
  convIdRef.current = initialConversationId;

  const [conversationId, setConversationId] = useState(initialConversationId);
  useEffect(() => { setConversationId(initialConversationId); }, [initialConversationId]);

  const jobId = conversationId ? activeJobs[conversationId] : undefined;
  const isLoading = status === 'running' || status === 'submitted' || !!jobId;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); setError(null); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  const mapMessages = useCallback((rawMessages: unknown[]): UIMessage[] => {
    const mapped = rawMessages.map((m) => normalizeMessage(m as Record<string, unknown>)) as unknown as UIMessage[];
    return mapped.filter(msg => msg.role !== 'tool');
  }, []);

  const fetchMessages = useCallback(async (cid: string) => {
    try {
      const res = await getConversationMessages(cid);
      if (res.success && res.messages) {
        setMessages(mapMessages(res.messages as unknown[]));
      }
    } catch (e) {
      CLIENT_LOG('fetchMessages', 'ERROR', e instanceof Error ? e.message : String(e));
    }
  }, [mapMessages]);

  useEffect(() => {
    if (initialConversationId && messages.length === 0) {
      setIsHydrating(true);
      fetchMessages(initialConversationId).finally(() => setIsHydrating(false));
    }
  }, [initialConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!jobId || !conversationId) {
      if (status === 'running') setStatus('ready');
      setActiveJobSteps([]);
      return;
    }

    setStatus('running');
    const interval = setInterval(async () => {
      try {
        const res = await getJobByJobId(jobId);
        if (res.success && res.job) {
          setActiveJobSteps((res.job.steps as JobStep[]) || []);
          if (res.job.status === 'completed' || res.job.status === 'failed') {
            removeActiveJob(conversationId);
            setStatus(res.job.status === 'failed' ? 'error' : 'ready');
            if (res.job.status === 'failed') setError(res.job.errorMessage || 'Unknown error');
            await fetchMessages(conversationId);
          }
        }
      } catch (err) {
        consecutiveErrors.current += 1;
        CLIENT_LOG('Polling', 'ERROR', `${consecutiveErrors.current}/3 — ${err instanceof Error ? err.message : String(err)}`);
        if (!navigator.onLine) {
          setError('Connection lost. Will retry when back online.');
        }
        if (consecutiveErrors.current >= 3) {
          removeActiveJob(conversationId);
          setStatus('error');
          setError('Job polling failed after 3 retries. The task may still complete on the server.');
        }
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      consecutiveErrors.current = 0;
    };
  }, [jobId, conversationId, removeActiveJob, fetchMessages]);

  useEffect(() => {
    onStreamingChange?.(conversationId || roomKey, isLoading);
  }, [isLoading, conversationId, roomKey, onStreamingChange]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages, isHydrating, activeJobSteps]);

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

  const sendMessage = useCallback(async ({ text }: { text: string }) => {
    const cid = convIdRef.current;

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text }]
    }]);

    setStatus('submitted');
    setError(null);

    try {
      const apiKey = localStorage.getItem('signalist-user-api-key') || undefined;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          conversationId: cid,
          selectedModel,
          apiKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      if (data.jobId && data.conversationId) {
        addActiveJob(data.conversationId, data.jobId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    }
  }, [selectedModel, addActiveJob]);

  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isLoading || isOffline) return;

    let cid = convIdRef.current;
    if (!cid && !creatingRef.current) {
      creatingRef.current = true;
      try {
        const res = await createConversation(input.slice(0, 80));
        if (res.success && res.conversationId) {
          cid = res.conversationId;
          convIdRef.current = cid;
          setConversationId(cid);
          onConversationCreated?.(roomKey, cid);
        }
      } catch (e) {
        CLIENT_LOG('createConversation', 'ERROR', e instanceof Error ? e.message : String(e));
      }
      creatingRef.current = false;
    }

    isAtBottomRef.current = true;
    await sendMessage({ text: input });
  }, [isLoading, isOffline, roomKey, onConversationCreated, sendMessage]);

  const hasContent = useCallback((m: UIMessage): boolean => {
    if (m.role === 'user') return true;
    if (!m.parts) return false;
    const hasText = m.parts.some((p) => p.type === 'text' && Boolean(p.text?.trim()));
    const hasTool = m.parts.some((p) => p.type === 'tool-call' || p.type === 'tool-result');
    return Boolean(hasText || hasTool);
  }, []);

  const addToolOutput = useCallback(async ({ toolCallId, toolName, output }: ToolOutputInput) => {
    setMessages(prev => {
      return prev.map(msg => {
        if (msg.role !== 'assistant' || !msg.parts) return msg;

        const hasCall = msg.parts.some((p) => p.type === 'tool-call' && p.toolCallId === toolCallId);
        if (!hasCall) return msg;

        const hasResult = msg.parts.some((p) => p.type === 'tool-result' && p.toolCallId === toolCallId);
        if (hasResult) return msg;

        return {
          ...msg,
          parts: [
            ...msg.parts,
            { type: 'tool-result', toolCallId, toolName, output }
          ]
        };
      });
    });
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
    activeJobSteps
  };
}
