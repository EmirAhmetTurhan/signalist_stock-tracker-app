'use client';

import { ArrowRight, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
  onRunBacktest?: (symbol: string, indicator: string) => void;
};

const SIGNAL_COLORS: Record<string, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-400',
  SELL: 'bg-red-500/20 text-red-400',
  CONFLICT: 'bg-yellow-500/20 text-yellow-400',
};

export default function IndicatorSignalsCard({ data, onRunBacktest }: Props) {
  const router = useRouter();
  const symbol = (data.symbol as string) || '';
  const indicators = (data.indicators as string[]) || [];
  const signals = (data.signals as Array<{ indicator: string; signal: string }>) || [];

  if (signals.length === 0 && indicators.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2.5">
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <span
              key={s.indicator}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${SIGNAL_COLORS[s.signal] || 'bg-gray-700 text-gray-300'}`}
            >
              {s.indicator.toUpperCase()}: {s.signal}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={() => router.push(`/ta?symbol=${encodeURIComponent(symbol)}&ind=${indicators.join(',')}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
        >
          <ArrowRight className="h-3 w-3" /> Apply to TA Page
        </button>
        {indicators.length === 1 && onRunBacktest && (
          <button
            onClick={() => onRunBacktest(symbol, indicators[0]!)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
          >
            <Play className="h-3 w-3" /> Run Backtest
          </button>
        )}
      </div>
    </div>
  );
}
