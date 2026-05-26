// hooks/useChatManager.ts — Shared chat logic used by both AI page and FloatingChatButton
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getConversationMessages, createConversation } from '@/lib/actions/chat-history.actions';
import { getJobByJobId } from '@/lib/actions/ai-job.actions';
import { normalizeMessage } from '@/lib/ai/message-format';

export type UIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data' | 'tool';
  content?: string;
  parts?: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; args?: any; result?: any; toolInvocation?: any }>;
};

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
  status: 'idle' | 'streaming' | 'running' | 'submitted' | 'error' | 'ready';
  isLoading: boolean;
  isHydrating: boolean;
  conversationId: string;
  error: string | null;
  isOffline: boolean;
  hasContent: (m: any) => boolean;
  handleSubmit: (input: string) => Promise<void>;
  addToolOutput: (...args: any[]) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
  activeJobSteps: any[];
};

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
  const [activeJobSteps, setActiveJobSteps] = useState<any[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'submitted' | 'error' | 'ready' | 'streaming'>('idle');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const creatingRef = useRef(false);

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

  const mapMessages = useCallback((msgs: any[]) => {
    // 1. Map raw DB messages into our Canonical UI format
    // DB messages already contain the merged tool results because they were saved completely by chat-async.ts
    const mapped = msgs.map((m) => normalizeMessage(m)) as any[];

    // Remove any extra redundant tool messages if they exist (they shouldn't normally anymore)
    return mapped.filter(msg => msg.role !== 'tool');
  }, []);

  const fetchMessages = useCallback(async (cid: string) => {
    try {
      const res = await getConversationMessages(cid);
      if (res.success && res.messages) {
        setMessages(mapMessages(res.messages));
      }
    } catch (e) {
      console.error('fetchMessages err:', e);
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
          setActiveJobSteps(res.job.steps || []);
          if (res.job.status === 'completed' || res.job.status === 'failed') {
            removeActiveJob(conversationId);
            setStatus(res.job.status === 'failed' ? 'error' : 'ready');
            if (res.job.status === 'failed') setError(res.job.errorMessage || 'Unknown error');
            await fetchMessages(conversationId);
          }
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 1500);

    return () => clearInterval(interval);
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
    let cid = convIdRef.current;
    
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
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  }, [messages, selectedModel, addActiveJob]);

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
      } catch (e) { console.error(e); }
      creatingRef.current = false;
    }

    isAtBottomRef.current = true;
    await sendMessage({ text: input });
  }, [isLoading, isOffline, roomKey, onConversationCreated, sendMessage]);

  const hasContent = useCallback((m: any) => {
    if (m.role === 'user') return true;
    if (!m.parts) return false;
    const hasText = m.parts.some((p: any) => p.type === 'text' && p.text?.trim());
    const hasTool = m.parts.some((p: any) => p.type === 'tool-call' || p.type === 'tool-result');
    return hasText || hasTool;
  }, []);

  const addToolOutput = useCallback(async ({ toolCallId, toolName, output }: { toolCallId: string; toolName: string; output: any }) => {
    // 1. Update the local UI state dynamically without a refresh
    setMessages(prev => {
      return prev.map(msg => {
        if (msg.role !== 'assistant' || !msg.parts) return msg;
        
        const hasCall = msg.parts.some((p: any) => p.type === 'tool-call' && p.toolCallId === toolCallId);
        if (!hasCall) return msg;

        const hasResult = msg.parts.some((p: any) => p.type === 'tool-result' && p.toolCallId === toolCallId);
        if (hasResult) return msg;

        // Add the result directly into the assistant's parts array for immediate rendering
        return {
          ...msg,
          parts: [
            ...msg.parts,
            { type: 'tool-result', toolCallId, toolName, output }
          ]
        };
      });
    });

    // 2. We no longer write to the database here!
    // Background tasks (like ai/optimize-parameter) update the AIJob report and that is it, 
    // or if they want to update chat, they should do it server-side.
    // This prevents dual DB writes causing duplicates.
  }, [conversationId]);

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
