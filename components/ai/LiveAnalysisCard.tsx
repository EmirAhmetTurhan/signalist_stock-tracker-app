'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, BarChart3, Bookmark, XCircle, AlertTriangle } from 'lucide-react';

function AnalysisErrorCard({ symbol, indicator, errorMessage }: { symbol: string; indicator: string; errorMessage?: string | null }) {
  return (
    <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-red-400" />
        <span className="text-sm font-medium text-red-300">Analysis Failed</span>
        <span className="text-[10px] text-red-600 ml-auto">{symbol} &bull; {indicator}</span>
      </div>

      <div className="bg-red-900/20 border border-red-800/20 rounded-lg px-3 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">
            {errorMessage || `Bilinmeyen bir hata olustu. ${indicator} optimizasyonu ${symbol} icin tamamlanamadi.`}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-gray-500">The stock data provider may be temporarily unavailable. You can try again later or check a different symbol.</p>
    </div>
  );
}

// Statik tamamlanmis analiz karti (polling yapmaz, veri zaten hazir)
export function AnalysisResultCard({ symbol, indicator, winRate, bestValue }: { symbol: string; indicator: string; winRate: number; bestValue: number }) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-emerald-300">Analysis Complete</span>
        <span className="text-[10px] text-emerald-600 ml-auto">{symbol} &bull; {indicator}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] text-gray-500 mb-0.5">Win Rate</div>
          <div className="text-lg font-bold text-emerald-400">{winRate}%</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] text-gray-500 mb-0.5">Best Parameter</div>
          <div className="text-lg font-bold text-yellow-400">{bestValue}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => router.push('/archive')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
        >
          <Bookmark className="h-3 w-3" /> View in Notebook
        </button>
        <button
          onClick={() => router.push(`/ta?symbol=${encodeURIComponent(symbol)}&ind=${indicator.toLowerCase()}&${indicator.toLowerCase()}_len=${bestValue}`)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 transition-colors"
        >
          <BarChart3 className="h-3 w-3" /> Apply to Chart
        </button>
      </div>
    </div>
  );
}

type StepInfo = { name: string; status: string; detail?: string; completedAt?: string };

function ReasoningChain({ steps }: { steps: StepInfo[] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="space-y-1 mt-2 pt-2 border-t border-gray-700/30">
      {steps.map((step, i) => {
        const isDone = step.status === 'completed';
        const isRunning = step.status === 'running';
        const isFailed = step.status === 'failed';

        return (
          <div key={i} className={`flex items-center gap-2 text-[11px] ${
            isFailed ? 'text-red-400' : isDone ? 'text-gray-500' : isRunning ? 'text-yellow-400' : 'text-gray-600'
          }`}>
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> :
             isDone ? <CheckCircle2 className="h-3 w-3 shrink-0" /> :
             isFailed ? <XCircle className="h-3 w-3 shrink-0" /> :
             <div className="h-3 w-3 rounded-full border border-gray-700 shrink-0" />}
            <span className="leading-tight">{step.detail || step.name}</span>
          </div>
        );
      })}
    </div>
  );
}

type LiveAnalysisCardProps = {
  jobId: string;
  symbol: string;
  indicator: string;
  toolCallId: string;
  toolName?: string;
  convId?: string;
  onToolOutput?: (opts: { toolCallId: string; toolName: string; output: any }) => void;
};

export default function LiveAnalysisCard({ jobId, symbol, indicator, toolCallId, toolName = 'optimizeParameter', convId, onToolOutput }: LiveAnalysisCardProps) {
  const router = useRouter();
  // Baslangic durumu null — ilk poll tamamlanana kadar processing gosterme (hydration sirasinda
  // zaten tamamlanmis isler icin anlik "Processing..." flasini engeller)
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed' | null>(null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [bestValue, setBestValue] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const injectedRef = useRef(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const { getReportByJobId } = await import('@/lib/actions/report.actions');
        const res = await getReportByJobId(jobId);
        if (res.success && res.report) {
          setStatus(res.report.status);
          if (res.report.steps) setSteps(res.report.steps);
          if (res.report.status === 'completed') {
            setWinRate(res.report.winRate);
            setBestValue(res.report.bestValue);
            setFullData(res.report.fullData);
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

            if (convId) {
              const { useAppStore } = await import('@/store/useAppStore');
              useAppStore.getState().removeActiveJob(convId);
            }

            // Sonucu AI SDK context'ine enjekte et.
            // injectedRef sayesinde bu bir kere yapilir — sonraki render'larda
            // GenerativeUI completedOpt uzerinden AnalysisResultCard'i render eder.
            if (!injectedRef.current && toolCallId && onToolOutput) {
              injectedRef.current = true;
              onToolOutput({
                toolCallId,
                toolName,
                output: {
                  success: true,
                  symbol,
                  indicator,
                  bestValue: res.report.bestValue,
                  winRate: res.report.winRate,
                  message: 'Background analysis completed successfully.',
                  ...(res.report.fullData || {}),
                },
              });
            }
          } else if (res.report.status === 'failed') {
            setErrorMessage(res.report.errorMessage || null);
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            if (convId) {
              const { useAppStore } = await import('@/store/useAppStore');
              useAppStore.getState().removeActiveJob(convId);
            }
          }
        }
      } catch { /* ignore polling errors */ }
    };

    poll();
    intervalRef.current = setInterval(poll, 1500);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId]);

  // ---- Render ----

  if (status === 'completed') {
    // addToolOutput basarili olduysa GenerativeUI completedOpt uzerinden
    // AnalysisResultCard veya RankingCard render eder. Burada render etme — cift kart olusmasin.
    if (injectedRef.current) return null;
    if (indicator === 'FIND_BEST' || indicator === 'RANK') return null;
    // Fallback: onToolOutput saglanmadiysa veya toolCallId yoksa
    // (hydration sirasinda, addToolOutput henuz cagrilamadiysa)
    if (winRate !== null && bestValue !== null) {
      return <AnalysisResultCard symbol={symbol} indicator={indicator} winRate={winRate} bestValue={bestValue} />;
    }
  }

  if (status === 'failed') {
    return <AnalysisErrorCard symbol={symbol} indicator={indicator} errorMessage={errorMessage} />;
  }

  // Ilk poll henuz tamamlanmadiysa (status null) — loading gosterme, bos don.
  // Bu sayede hydration'da zaten tamamlanmis isler icin anlik "Processing..." flasi olusmaz.
  if (status === null) return null;

  // status === 'processing'
  return (
    <div className="rounded-xl border border-yellow-800/30 bg-yellow-900/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />
        <span className="text-xs text-yellow-400 font-medium">Optimizing {indicator} for {symbol}...</span>
        <span className="text-[10px] text-yellow-600/70 ml-auto">Background</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-500/50 rounded-full animate-pulse w-3/4" />
      </div>
      <ReasoningChain steps={steps} />
      {steps.length === 0 && (
        <p className="text-[10px] text-gray-500">Running heavy computation in the background. Results will appear here automatically.</p>
      )}
    </div>
  );
}
