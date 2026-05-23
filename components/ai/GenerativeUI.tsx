'use client';

import { useState, useEffect, type ReactNode, memo } from 'react';
import { Loader2 } from 'lucide-react';
import LiveAnalysisCard, { AnalysisResultCard } from '@/components/ai/LiveAnalysisCard';
import { getAllToolResults, getFailedToolResults, isOptimizeParamCall, hasOptimizeParamResult } from '@/lib/ai/tool-parser';
import { getToolCard } from '@/components/ai/registry';
import ErrorCard from '@/components/ai/ErrorCard';
import type { ToolCardProps } from '@/components/ai/registry';

type Message = {
  id: string;
  role: string;
  parts?: any[];
};

// Multi-path veri cekme: result -> output.value -> output -> toolInvocation.result
function getCompletedOptimizationData(message: Message): { symbol: string; indicator: string; bestValue: number; winRate: number; fullData?: Record<string, unknown> } | null {
  if (!message.parts) return null;

  for (const part of message.parts) {
    const data =
      part.result ||
      part.output?.value ||
      part.output ||
      part.toolInvocation?.result ||
      part.toolInvocation?.output?.value ||
      part.toolInvocation?.output ||
      null;

    if (data && typeof data.bestValue === 'number' && typeof data.winRate === 'number') {
      return {
        symbol: data.symbol || '',
        indicator: data.indicator || '',
        bestValue: data.bestValue,
        winRate: data.winRate,
        fullData: data.fullData,
      };
    }
  }

  return null;
}

function getBackgroundJobInfo(message: Message): { jobIds: string[]; symbol: string; indicator: string; toolCallId: string; isBatch: boolean } | null {
  if (!message.parts) return null;

  for (const part of message.parts) {
    const data =
      part.result ||
      part.output?.value ||
      part.output ||
      part.toolInvocation?.result ||
      part.toolInvocation?.output?.value ||
      part.toolInvocation?.output ||
      null;

    if (data && data.isBackgroundJob === true) {
      const toolCallId = part.toolCallId || part.toolInvocation?.toolCallId || '';
      
      if (data.isBatchJob && Array.isArray(data.jobIds)) {
        return {
          jobIds: data.jobIds,
          symbol: data.symbols ? data.symbols.join(', ') : '',
          indicator: data.indicator || '',
          toolCallId,
          isBatch: true,
        };
      } else if (typeof data.jobId === 'string') {
        return {
          jobIds: [data.jobId],
          symbol: data.symbol || '',
          indicator: data.indicator || '',
          toolCallId,
          isBatch: false,
        };
      }
    }
  }

  return null;
}

type Props = {
  message: Message;
  convId?: string;
  isLast?: boolean;
  onRunBacktest?: (symbol: string, indicator: string) => void;
  onToolOutput?: (opts: { toolCallId: string; toolName: string; output: any }) => void;
  onFollowUp?: (text: string) => void;
};

export default function GenerativeUI({ message, convId, isLast, onRunBacktest, onToolOutput, onFollowUp }: Props) {
  const [followUp, setFollowUp] = useState('');

  // ---- OptimizeParameter ozel akisi (korundu) ----
  const completedOpt = getCompletedOptimizationData(message);
  const bgJob = completedOpt ? null : getBackgroundJobInfo(message);

  // Global Zustand'a kaydet: sidebar'da spinner gostermek icin
  useEffect(() => {
    if (bgJob && convId) {
      import('@/store/useAppStore').then(({ useAppStore }) => {
        bgJob.jobIds.forEach(id => {
          useAppStore.getState().addActiveJob(convId, id);
        });
      });
    }
  }, [bgJob ? bgJob.jobIds.join(',') : null, convId]);

  // Guard check values extracted for later use
  let shouldHide = false;
  if (message.role !== 'assistant' && message.role !== 'tool') shouldHide = true;
  if (!shouldHide && message.parts) {
    const hasText = message.parts.some((p: any) => p.type === 'text' && p.text?.trim());
    const hasToolResult = message.parts.some((p: any) =>
      (p.type === 'tool-result') ||
      (p.type === 'tool-invocation' && p.toolInvocation?.state === 'result')
    );
    const hasOptCall = isOptimizeParamCall(message);
    const hasOptResult = hasOptimizeParamResult(message);
    const hasClarificationCall = message.parts.some((p: any) => 
      (p.type === 'tool-call' && p.toolName === 'askClarification') ||
      (p.type === 'tool-invocation' && p.toolInvocation?.toolName === 'askClarification' && p.toolInvocation?.state === 'call')
    );
    if (hasOptCall && !hasOptResult && !hasText) shouldHide = true;
    if (!hasText && !hasToolResult && !hasClarificationCall) shouldHide = true;
  }

  // ---- Registry tabanli kart render ----
  // NOT: useMemo KULLANILMAZ — streaming sırasında message referansı değişmeyebilir,
  // bu yüzden tool sonuçları gelince kartlar render edilmezdi (refresh'te düzeliyordu).
  const toolResults = getAllToolResults(message);
  const toolCards = toolResults
    .filter((tr) => tr.toolName !== 'optimizeParameter')
    .filter((tr) => !tr.isError)
    .filter((tr) => {
      // Eğer araç hatasız dönse bile içerisinde başarı=false mesajı varsa normal kart çizme
      if (tr.data && tr.data.success === false) return false;
      // Skip tool results with empty/incomplete data (ghost UI prevention)
      if (!tr.data || Object.keys(tr.data).length === 0) return false;
      return true;
    })
    .map((tr) => {
      const config = getToolCard(tr.toolName);
      if (!config) return null;
      const CardComponent = config.component;
      const symbol = (tr.data.symbol as string) || undefined;
      return (
        <CardComponent
          key={`${message.id}-${tr.toolCallId || tr.toolName}`}
          toolName={tr.toolName}
          data={tr.data}
          symbol={symbol}
          messageParts={message.parts}
          isLast={isLast}
          onRunBacktest={onRunBacktest}
          onFollowUp={onFollowUp}
        />
      );
    })
    .filter(Boolean);

  // ---- Hata kartlari ----
  const failedResults = getFailedToolResults(message);
  const gracefulFailedResults = toolResults.filter(tr => tr.data && tr.data.success === false);

  const errorCards = [
    ...failedResults.map((tr) => (
      <ErrorCard
        key={`error-${message.id}-${tr.toolName}`}
        errorCode={(tr.data.errorCode as string) || undefined}
        userMessage={(tr.data.userMessage as string) || (tr.data.error as string) || undefined}
        recoverable={tr.data.recoverable !== false}
      />
    )),
    ...gracefulFailedResults.map((tr) => (
      <ErrorCard
        key={`graceful-${message.id}-${tr.toolName}`}
        userMessage={(tr.data.userMessage as string) || (tr.data.error as string) || "Bilinmeyen bir hata oluştu."}
        recoverable={tr.data.recoverable !== false}
      />
    ))
  ];

  const hasContent = !!bgJob || !!completedOpt || toolCards.length > 0 || errorCards.length > 0;
  if (shouldHide || !hasContent) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Tamamlanmis optimizasyon sonucu (statik, polling yok) */}
      {completedOpt && (
        <AnalysisResultCard
          symbol={completedOpt.symbol}
          indicator={completedOpt.indicator}
          winRate={completedOpt.winRate}
          bestValue={completedOpt.bestValue}
        />
      )}

      {/* Live Analysis Polling Card */}
      {bgJob && !bgJob.isBatch && (
        <LiveAnalysisCard
          jobId={bgJob.jobIds[0]}
          symbol={bgJob.symbol}
          indicator={bgJob.indicator}
          toolCallId={bgJob.toolCallId}
          convId={convId}
          onToolOutput={onToolOutput}
        />
      )}

      {/* Batch Analysis Notice */}
      {bgJob && bgJob.isBatch && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-blue-400 text-sm">
          <strong>Toplu İşlem Başlatıldı:</strong> {bgJob.jobIds.length} adet hisse ({bgJob.symbol}) için {bgJob.indicator} analizi arka planda çalışıyor. Görev Yöneticisi'nden takip edebilirsiniz.
        </div>
      )}

      {/* Registry kartlari (16 tool'un hepsi buradan render edilir) */}
      {toolCards}

      {/* Hata kartlari */}
      {errorCards}

      {isLast && (
        <div className="flex gap-1.5">
          <input
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && followUp.trim()) {
                onFollowUp?.(followUp.trim());
                setFollowUp('');
              }
            }}
            placeholder="Follow-up: e.g. optimize RSI period..."
            className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-yellow-500/30"
          />
        </div>
      )}
    </div>
  );
}
