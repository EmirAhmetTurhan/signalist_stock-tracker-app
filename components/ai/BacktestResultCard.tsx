'use client';

import { BarChart3, TrendingUp, Hash } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

export default function BacktestResultCard({ data }: Props) {
  const router = useRouter();
  const symbol = (data.symbol as string) || '';
  const indicator = (data.indicator as string) || '';
  const winRate = data.winRate as number | null;
  const totalSignals = data.totalSignals as number | null;
  const paramName = data.paramName as string | undefined;
  const paramValue = data.paramValue as number | undefined;

  if (winRate == null) return null;

  const confidence = winRate >= 65 ? 'High' : winRate >= 50 ? 'Medium' : 'Low';
  const confColor = winRate >= 65 ? 'text-emerald-400' : winRate >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-yellow-400" />
        <span className="text-xs font-medium text-gray-200">
          {indicator?.toUpperCase()} Backtest {symbol ? `for ${symbol}` : ''}
        </span>
        <span className={`text-[10px] font-medium ml-auto ${confColor}`}>{confidence} confidence</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] text-gray-500 mb-0.5">Win Rate</div>
          <div className="text-base font-bold text-emerald-400">{winRate}%</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <div className="text-[10px] text-gray-500 mb-0.5">Total Signals</div>
          <div className="text-base font-bold text-gray-200">{totalSignals ?? '—'}</div>
        </div>
      </div>

      {paramName && paramValue != null && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <Hash className="h-3 w-3" />
          Parameter: {paramName} = {paramValue}
        </div>
      )}

      <button
        onClick={() => router.push(`/ta?symbol=${encodeURIComponent(symbol)}&ind=${indicator?.toLowerCase()}`)}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
      >
        <TrendingUp className="h-3 w-3" /> View {indicator?.toUpperCase()} Chart
      </button>
    </div>
  );
}
