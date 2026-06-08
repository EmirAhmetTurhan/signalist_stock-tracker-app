'use client';

import { Send, Bot, User } from 'lucide-react';
import { useState, useEffect, memo } from 'react';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import ErrorCard from '@/components/ai/ErrorCard';
import GenerativeUI from '@/components/ai/GenerativeUI';
import ToolProgress from '@/components/ai/ToolProgress';
import { ThinkingSkeleton } from '@/components/ai/ThinkingSkeleton';
import { useChatManager } from '@/hooks/useChatManager';
import type { UIMessage } from '@/hooks/useChatManager';
import { normalizeUIParts, getMessageText } from '@/lib/ai/message-format';

// ─── Component ──────────────────────────────────────────────────────────────

export interface ChatAreaProps {
  roomKey: string;
  convId: string;
  isVisible: boolean;
  selectedModel?: string;
  onCreated: (roomKey: string, newConvId: string) => void;
  onStreamingChange: (id: string, isStreaming: boolean) => void;
}

const ChatAreaInner = ({
  roomKey, convId, isVisible, selectedModel, onCreated, onStreamingChange,
}: ChatAreaProps) => {
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 px-4">
        <div className="max-w-4xl mx-auto space-y-5">
          {isOffline && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-amber-400 text-sm flex items-center gap-2" role="alert">
              <span className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
              Connection lost. Will resume automatically when back online.
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-sm flex items-center justify-between" role="alert">
              <span>Error: {error}</span>
              <button onClick={() => window.location.reload()} className="text-red-300 underline text-xs hover:text-red-200" aria-label="Reload page">Reload Page</button>
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

            const effectiveParts = normalizeUIParts(m.parts, m as unknown as Record<string, unknown>);
            const mWithParts = { ...m, parts: effectiveParts };
            const text = getMessageText(m.parts, m as unknown as Record<string, unknown>);

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
                      <GenerativeUI
                        message={mWithParts as unknown as { id: string; role: string; parts?: unknown[] }}
                        convId={convId}
                        isLast={index === messages.length - 1}
                        onToolOutput={({ toolCallId, toolName, output }) => addToolOutput({ toolCallId, toolName, output })}
                        onFollowUp={(t) => sendMessage({ text: t })}
                      />
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
          {error && (
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

      <form onSubmit={handleSubmit} className="shrink-0 py-3 px-4 bg-gray-900 border-t border-gray-800 w-full" role="form" aria-label="Chat message form">
        <div className="flex gap-2 max-w-4xl mx-auto w-full">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about stock analysis, indicators, or market questions..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-500/50"
            disabled={isLoading}
            aria-label="Type your message"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-medium px-5 rounded-xl transition-colors"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
};

export const ChatArea = memo(ChatAreaInner);
