'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Bot, User, Send, Sparkles, History, Plus, MessageSquare } from 'lucide-react';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import GenerativeUI from '@/components/ai/GenerativeUI';
import ToolProgress from '@/components/ai/ToolProgress';
import ModelSelector from '@/components/ai/ModelSelector';
import { useChatManager } from '@/hooks/useChatManager';

const SIZE_KEY = 'signalist-chat-size';
const MSG_KEY = 'signalist-chat-messages';

const DEFAULT_W = 420;
const DEFAULT_H = 520;
const MIN_W = 320;
const MIN_H = 360;
const MAX_W_PCT = 0.4;
const MAX_H_PCT = 0.8;

function loadSize() {
  if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H };
  try { const raw = localStorage.getItem(SIZE_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return { w: DEFAULT_W, h: DEFAULT_H };
}
function saveSize(w: number, h: number) {
  try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h })); } catch { /* ignore */ }
}

function loadMessages() {
  if (typeof window === 'undefined') return [];
  try { const raw = localStorage.getItem(MSG_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return [];
}
function saveMessages(msgs: any[]) {
  try { localStorage.setItem(MSG_KEY, JSON.stringify(msgs.slice(-50))); } catch { /* ignore */ }
}

type ResizeEdge = 'left' | 'top' | 'tl' | null;

export default function FloatingChatButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const maxW = typeof window !== 'undefined' ? Math.round(window.innerWidth * MAX_W_PCT) : 700;
  const maxH = typeof window !== 'undefined' ? Math.round(window.innerHeight * MAX_H_PCT) : 700;

  const [panelSize, setPanelSize] = useState({ w: clamp(DEFAULT_W, MIN_W, maxW), h: clamp(DEFAULT_H, MIN_H, maxH) });
  const [sizeLoaded, setSizeLoaded] = useState(false);

  useEffect(() => {
    if (sizeLoaded) return;
    const saved = loadSize();
    setPanelSize({ w: clamp(saved.w || DEFAULT_W, MIN_W, maxW), h: clamp(saved.h || DEFAULT_H, MIN_H, maxH) });
    setSizeLoaded(true);
  }, [sizeLoaded, maxW, maxH]);

  // ---- Resize ----
  const [resizing, setResizing] = useState<ResizeEdge>(null);
  const resizeRef = useRef({ sx: 0, sy: 0, pw: 0, ph: 0 });

  const onResizeStart = useCallback((edge: ResizeEdge) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setResizing(edge);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, pw: panelSize.w, ph: panelSize.h };
  }, [panelSize]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeRef.current.sx;
      const dy = e.clientY - resizeRef.current.sy;
      setPanelSize((prev) => {
        let nw = prev.w; let nh = prev.h;
        if (resizing === 'left' || resizing === 'tl') nw = clamp(resizeRef.current.pw - dx, MIN_W, maxW);
        if (resizing === 'top' || resizing === 'tl') nh = clamp(resizeRef.current.ph - dy, MIN_H, maxH);
        return { w: nw, h: nh };
      });
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [resizing, maxW, maxH]);

  useEffect(() => { if (!resizing) saveSize(panelSize.w, panelSize.h); }, [resizing]); // eslint-disable-line

  // ---- Conversation history ----
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      const { getUserConversations } = await import('@/lib/actions/chat-history.actions');
      const res = await getUserConversations();
      if (res.success && res.conversations) setConversations(res.conversations.slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (open) loadConversations(); }, [open, loadConversations]);

  // ---- Shared chat manager (stable roomKey = stream survives conversation switch) ----
  const {
    messages, sendMessage, setMessages, isLoading, isHydrating,
    error, isOffline,
    hasContent, handleSubmit: submit, addToolOutput,
    scrollContainerRef, messagesEndRef,
  } = useChatManager({
    roomKey: 'floating',
    initialConversationId: conversationId,
    selectedModel,
    onConversationCreated: (_roomKey, newConvId) => {
      setConversationId(newConvId);
      loadConversations();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
    setInput('');
  };

  // localStorage persistence for anonymous chats
  useEffect(() => {
    if (messages.length === 0 || conversationId || isLoading) return;
    saveMessages(messages);
  }, [messages, conversationId, isLoading]);

  // Load anonymous messages
  const [anonLoaded, setAnonLoaded] = useState(false);
  useEffect(() => {
    if (!open || conversationId || anonLoaded) return;
    const saved = loadMessages();
    if (saved.length > 0) setMessages(saved);
    setAnonLoaded(true);
  }, [open, conversationId, anonLoaded, setMessages]);

  const handleNewChat = useCallback(() => {
    setConversationId('');
    setMessages([]);
    setHistoryOpen(false);
    setAnonLoaded(false);
  }, [setMessages]);

  const handleSelectConv = (id: string) => {
    setConversationId(id);
    setHistoryOpen(false);
  };

  const handleClose = () => setOpen(false);

  if (pathname === '/ai') return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:scale-105 transition-all flex items-center justify-center"
        title="Signalist AI"
        style={{ display: open ? 'none' : undefined }}
      >
        <MessageCircle className="h-6 w-6 text-black" />
      </button>

      <div style={{ display: open ? undefined : 'none' }}>
        <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" onClick={handleClose} />

        <div
          className="fixed z-50 bottom-4 right-4 bg-[#141414] border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: panelSize.w, height: panelSize.h }}
        >
          {/* Resize edges */}
          <div className="absolute inset-y-0 left-0 w-1.5 -ml-0.5 z-10 cursor-w-resize" onMouseDown={onResizeStart('left')} />
          <div className="absolute inset-x-0 top-0 h-1.5 -mt-0.5 z-10 cursor-n-resize" onMouseDown={onResizeStart('top')} />
          <div className="absolute top-0 left-0 w-4 h-4 -ml-0.5 -mt-0.5 z-10 cursor-nw-resize" onMouseDown={onResizeStart('tl')} />

          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/50 select-none shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-black" />
              </div>
              <span className="text-sm font-medium text-gray-200">Signalist AI</span>
              <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} />
            </div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button onClick={() => { loadConversations(); setHistoryOpen(!historyOpen); }} className="hover:bg-gray-700 rounded-lg p-1.5 transition-colors text-gray-400" title="History">
                  <History className="h-3.5 w-3.5" />
                </button>
                {historyOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                      <button onClick={handleNewChat} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors border-b border-gray-700">
                        <Plus className="h-3 w-3" />New Chat
                      </button>
                      <div className="max-h-[180px] overflow-y-auto">
                        {conversations.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No saved conversations</p>}
                        {conversations.map((c) => (
                          <button key={c.id} onClick={() => handleSelectConv(c.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${conversationId === c.id ? 'text-yellow-400 bg-gray-700/50' : 'text-gray-400'}`}>
                            <MessageSquare className="h-3 w-3 shrink-0" /><span className="truncate">{c.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={handleClose} className="hover:bg-gray-700 rounded-lg p-1.5 transition-colors" title="Close">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
            {isHydrating && (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`flex gap-2 ${i % 2 === 1 ? 'justify-end' : ''}`}>
                    {i % 2 === 0 && <div className="h-6 w-6 rounded-md bg-gray-800 animate-pulse shrink-0" />}
                    <div className={`rounded-xl px-3 py-2 animate-pulse ${i % 2 === 1 ? 'bg-blue-600/30 w-2/3' : 'bg-gray-800/50 w-4/5'}`}>
                      <div className="h-2.5 bg-gray-600/30 rounded w-full mb-1.5" /><div className="h-2.5 bg-gray-600/30 rounded w-2/3" />
                    </div>
                    {i % 2 === 1 && <div className="h-6 w-6 rounded-md bg-gray-800 animate-pulse shrink-0" />}
                  </div>
                ))}
              </div>
            )}
            {messages.length === 0 && !isLoading && !isHydrating && (
              <div className="text-center py-8"><p className="text-gray-500 text-xs">Ask me anything about technical analysis.</p></div>
            )}
            {messages.map((m, index) => {
              if (!hasContent(m)) return null;
              
              // Normalize parts from toolInvocations during streaming (AI SDK v3 support)
              const effectiveParts = m.parts || ((m as any).toolInvocations ? (m as any).toolInvocations.map((inv: any) => ({
                type: 'tool-invocation',
                toolInvocation: inv
              })) : []);
              
              const mWithParts = { ...m, parts: effectiveParts };

              const textPart = effectiveParts.find((p: any) => p.type === 'text' && 'text' in p);
              const text = (textPart as any)?.text ?? (m as any).content ?? '';

              return (
                <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role !== 'user' && <div className="h-6 w-6 rounded-md bg-yellow-500/20 flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5 text-yellow-500" /></div>}
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'}`}>
                    {m.role === 'user' ? text : (
                      <>
                        <ToolProgress parts={effectiveParts} isLoading={isLoading} />
                        {text && <MarkdownRenderer content={text} />}
                        <GenerativeUI message={mWithParts as any} convId={conversationId || undefined} isLast={index === messages.length - 1} onToolOutput={({ toolCallId, toolName, output }) => addToolOutput({ toolCallId, tool: toolName, output })} onFollowUp={(text: string) => sendMessage({ text })} />
                      </>
                    )}
                  </div>
                  {m.role === 'user' && <div className="h-6 w-6 rounded-md bg-blue-500/20 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-blue-400" /></div>}
                </div>
              );
            })}
            {isLoading && (() => {
              const hasActiveTool = messages.some((m) =>
                m.parts?.some((p: any) =>
                  (p.type === 'tool-invocation' && p.toolInvocation?.state === 'call') || (p.type === 'tool-call')
                )
              );
              if (hasActiveTool) return null;
              return (
                <div className="flex gap-2">
                  <div className="h-6 w-6 rounded-md bg-yellow-500/20 flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5 text-yellow-500" /></div>
                  <div className="bg-gray-800 rounded-xl rounded-bl-sm px-3 py-2">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-gray-800 p-3 shrink-0">
            <div className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about stocks..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
                disabled={isLoading} />
              <button type="submit" disabled={isLoading || !input.trim()}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black rounded-lg px-3 transition-colors">
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
