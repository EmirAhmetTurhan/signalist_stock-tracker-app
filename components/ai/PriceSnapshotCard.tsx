'use client';

import { ArrowRight, Plus, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

export default function PriceSnapshotCard({ data }: Props) {
  const router = useRouter();
  const symbol = (data.symbol as string) || '';
  const price = data.price as number | null;
  const changePercent = data.changePercent as number | null;

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-gray-100">{symbol}</span>
        {price != null && (
          <span className="text-lg font-bold text-gray-100">
            ${typeof price === 'number' ? price.toFixed(2) : price}
          </span>
        )}
        {changePercent != null && (
          <span className={`text-xs font-medium ${changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => router.push(`/ta?symbol=${encodeURIComponent(symbol)}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
        >
          <ArrowRight className="h-3 w-3" /> Analyze
        </button>
        <button
          onClick={() => router.push(`/stocks/${encodeURIComponent(symbol)}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
        >
          <Plus className="h-3 w-3" /> Details
        </button>
        <button
          onClick={() => router.push(`/alerts/create?symbol=${encodeURIComponent(symbol)}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
        >
          <Bell className="h-3 w-3" /> Alert
        </button>
      </div>
    </div>
  );
}
