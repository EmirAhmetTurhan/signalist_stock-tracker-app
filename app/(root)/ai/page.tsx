// app/(root)/ai/page.tsx — AI sohbet sayfası (Multi-room + Type-safe)
'use client';

import { Send, Bot, User, Sparkles, Menu, Plus, Trash2, MessageSquare, Pin, Pencil, MoreVertical, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, memo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import ErrorCard from '@/components/ai/ErrorCard';
import GenerativeUI from '@/components/ai/GenerativeUI';
import ToolProgress from '@/components/ai/ToolProgress';
import ModelSelector from '@/components/ai/ModelSelector';
import { ThinkingSkeleton } from '@/components/ai/ThinkingSkeleton';
import { useAppStore } from '@/store/useAppStore';
import { useChatManager } from '@/hooks/useChatManager';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Conv = { id: string; title: string; updatedAt: string; isPinned: boolean };
type Room = { key: string; convId: string };

const ChatAreaInner = ({
  roomKey,
  convId,
  isVisible,
  selectedModel,
  onCreated,
  onStreamingChange,
}: {
  roomKey: string;
  convId: string;
  isVisible: boolean;
  selectedModel?: string;
  onCreated: (roomKey: string, newConvId: string) => void;
  onStreamingChange: (id: string, isStreaming: boolean) => void;
}) => {
  const [input, setInput] = useState('');

  const {
    messages, sendMessage, isLoading, isHydrating, hasContent,
    error, isOffline, activeJobSteps,
    handleSubmit: submit, addToolOutput,
    scrollContainerRef, messagesEndRef, isAtBottomRef,
  } = useChatManager({
    roomKey,
    initialConversationId: convId,
    selectedModel,
    onConversationCreated: onCreated,
    onStreamingChange,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
    setInput('');
  };

  // Scroll when room becomes visible while streaming
  useEffect(() => {
    if (isVisible && isLoading) {
      isAtBottomRef.current = true;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, [isVisible, isLoading, isAtBottomRef, messagesEndRef]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Scrollable Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 px-4">
        <div className="max-w-4xl mx-auto space-y-5">
          {isOffline && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-amber-400 text-sm flex items-center gap-2">
              <span className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
              Internet baglantisi kesildi. Yeniden baglaninca otomatik devam edecek.
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-sm flex items-center justify-between">
              <span>Hata: {error}</span>
              <button onClick={() => window.location.reload()} className="text-red-300 underline text-xs hover:text-red-200">Sayfayi Yenile</button>
            </div>
          )}
          {isHydrating && (
            <div className="flex items-center gap-2 text-gray-500 text-sm animate-pulse">
              <Bot className="h-4 w-4" /> Loading conversation...
            </div>
          )}
          {messages.length === 0 && !isLoading && !isHydrating && (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-yellow-500" />
              </div>
              <p className="text-gray-400 text-sm">Your financial analysis assistant is ready.</p>
            </div>
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
              <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role !== 'user' && (
                  <div className="h-7 w-7 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-yellow-500" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-md' : 'bg-gray-800 text-gray-200 rounded-tl-md'
                }`}>
                  {m.role === 'user' ? text : (
                    <>
                      <ToolProgress parts={effectiveParts} isLoading={isLoading} />
                      {text && <MarkdownRenderer content={text} />}
                      <GenerativeUI message={mWithParts as any} convId={convId} isLast={index === messages.length - 1} onToolOutput={({ toolCallId, toolName, output }) => addToolOutput({ toolCallId, tool: toolName, output })} onFollowUp={(text) => sendMessage({ text })} />
                    </>
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="h-7 w-7 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-blue-400" />
                  </div>
                )}
              </div>
            );
          })}
          {isLoading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-yellow-500" />
              </div>
              <ThinkingSkeleton steps={activeJobSteps} />
            </div>
          )}
          {status === 'error' && error && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-red-500" />
              </div>
              <div className="max-w-[80%]">
                <ErrorCard userMessage={error} recoverable={true} />
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed Input Bar */}
      <form onSubmit={handleSubmit} className="shrink-0 py-3 px-4 bg-gray-900 border-t border-gray-800 w-full">
        <div className="flex gap-2 max-w-4xl mx-auto w-full">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about stock analysis, indicators, or market questions..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-medium px-5 rounded-xl transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

const ChatArea = memo(ChatAreaInner);

function AIPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('id') || '';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [streamingMap, setStreamingMap] = useState<Record<string, boolean>>({});
  const [selectedModel, setSelectedModel] = useState('');
  const activeJobs = useAppStore((s) => s.activeJobs);

  const loadConversations = useCallback(async () => {
    try {
      const { getUserConversations } = await import('@/lib/actions/chat-history.actions');
      const res = await getUserConversations();
      if (res.success && res.conversations) {
        const convs = res.conversations as Conv[];
        convs.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setConversations(convs);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // URL'deki convId → odaya dönüştür (yoksa yeni oda oluştur)
  useEffect(() => {
    setRooms((prev) => {
      const exists = prev.find((r) => r.convId === activeId);
      if (exists) {
        if (activeKey !== exists.key) setActiveKey(exists.key);
        return prev;
      }
      const newKey = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setActiveKey(newKey);
      return [...prev, { key: newKey, convId: activeId }];
    });
  }, [activeId, activeKey]);

  // Lazy creation: roomKey sabit kalır, convId güncellenir → unmount OLMAZ
  const handleCreated = useCallback((roomKey: string, newDbId: string) => {
    setRooms((prev) => prev.map((r) => (r.key === roomKey ? { ...r, convId: newDbId } : r)));
    router.replace(`/ai?id=${newDbId}`, { scroll: false });
    loadConversations();
  }, [router, loadConversations]);

  const forceNewEmptyRoom = useCallback(() => {
    setRooms((prev) => {
      const existing = prev.find((r) => r.convId === '');
      if (existing) {
        // Zaten boş oda var → yeni oluşturma, sadece aktif yap (DOM şişmesi önlenir)
        setActiveKey(existing.key);
        return prev;
      }
      // İlk kez boş oda → oluştur
      const newKey = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setActiveKey(newKey);
      const kept = prev.filter((r) => r.convId !== '');
      return [...kept, { key: newKey, convId: '' }];
    });
  }, []);

  const handleNewChat = useCallback(() => {
    forceNewEmptyRoom();
    router.replace('/ai', { scroll: false });
  }, [router, forceNewEmptyRoom]);

  const handleDeleteConv = useCallback(async (id: string) => {
    const { deleteConversation } = await import('@/lib/actions/chat-history.actions');
    const res = await deleteConversation(id);
    if (res.success) {
      const isActive = activeId === id;
      setRooms((prev) => {
        const filtered = prev.filter((r) => r.convId !== id);
        if (isActive) {
          const newKey = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          setActiveKey(newKey);
          return [...filtered, { key: newKey, convId: '' }];
        }
        return filtered;
      });
      if (isActive) router.replace('/ai', { scroll: false });
      loadConversations();
    }
  }, [activeId, router, loadConversations]);

  const handleStreamingChange = useCallback((id: string, isStreaming: boolean) => {
    setStreamingMap((prev) => {
      if (prev[id] === isStreaming) return prev; // Değişmediyse re-render tetikleme
      return { ...prev, [id]: isStreaming };
    });
  }, []);

  const handlePinConv = useCallback(async (id: string) => {
    const { togglePinConversation } = await import('@/lib/actions/chat-history.actions');
    await togglePinConversation(id);
    loadConversations();
  }, [loadConversations]);

  const handleRenameStart = useCallback((id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  }, []);

  const handleRenameSave = useCallback(async (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    const { updateConversationTitle } = await import('@/lib/actions/chat-history.actions');
    await updateConversationTitle(id, editTitle.trim());
    setEditingId(null);
    loadConversations();
  }, [editTitle, loadConversations]);

  return (
    <div className="fixed inset-0 top-[65px] flex bg-black">
      {/* Sidebar */}
      <aside className={`relative flex flex-col shrink-0 bg-gray-900 border-r border-white/5 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-12'}`}>
        <div className={`flex items-center gap-1 p-2 border-b border-gray-800 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400" title="Toggle sidebar">
            <Menu className="h-5 w-5" />
          </button>
          {sidebarOpen && (
            <button onClick={handleNewChat} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300 hover:bg-gray-800">
              <Plus className="h-3.5 w-3.5" />New
            </button>
          )}
          {sidebarOpen && (
            <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} />
          )}
        </div>
        {sidebarOpen && (
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-6">No conversations yet</p>
            )}
            {conversations.map((c) => {
              const isActive = activeId === c.id;
              const isEditing = editingId === c.id;
              const isStreaming = streamingMap[c.id];
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isEditing) router.replace(`/ai?id=${c.id}`, { scroll: false }); }}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isEditing) { e.preventDefault(); router.replace(`/ai?id=${c.id}`, { scroll: false }); } }}
                  className={`group relative w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm cursor-pointer ${isActive ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-800'}`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleRenameSave(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSave(c.id); if (e.key === 'Escape') setEditingId(null); }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-gray-700 border border-yellow-500/50 rounded px-2 py-0.5 text-xs outline-none"
                    />
                  ) : (
                    <>
                      {activeJobs[c.id] ? (
                        <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin shrink-0" />
                      ) : isStreaming ? (
                        <span className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse shrink-0" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="flex-1 truncate">{c.title}</span>
                    </>
                  )}
                  {!isEditing && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-600 rounded shrink-0"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
                        </div>
                      </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-gray-800 border-gray-700 text-gray-200">
                          <DropdownMenuItem onClick={() => handlePinConv(c.id)} className="text-xs cursor-pointer hover:!bg-gray-700">
                            <Pin className="h-3.5 w-3.5 mr-2" />{c.isPinned ? 'Unpin' : 'Pin'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRenameStart(c.id, c.title)} className="text-xs cursor-pointer hover:!bg-gray-700">
                            <Pencil className="h-3.5 w-3.5 mr-2" />Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="!bg-gray-700" />
                          <DropdownMenuItem onClick={() => handleDeleteConv(c.id)} className="text-xs text-red-400 cursor-pointer hover:!bg-gray-700">
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-black">
        <div className="flex items-center gap-3 py-3 px-4 shrink-0 border-b border-gray-800/50">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-black" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-100">Signalist AI</h1>
            <p className="text-[10px] text-gray-500">Technical analysis assistant</p>
          </div>
        </div>

        {/* Multi-room Container */}
        <div className="flex-1 relative overflow-hidden">
          {rooms.map((room) => {
            const isActive = room.key === activeKey;
            return (
              <div
                key={room.key}
                className="absolute inset-0 w-full h-full flex"
                style={{ display: isActive ? undefined : 'none' }}
              >
                <ChatArea
                  roomKey={room.key}
                  convId={room.convId}
                  isVisible={isActive}
                  selectedModel={selectedModel}
                  onCreated={handleCreated}
                  onStreamingChange={handleStreamingChange}
                />
              </div>
            );
          })}
          {rooms.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 text-sm">Select a conversation or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ---- Ana Sayfa Wrapper ----
export default function AIPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center h-full">Yükleniyor...</div>}>
      <AIPageContent />
    </Suspense>
  );
}
