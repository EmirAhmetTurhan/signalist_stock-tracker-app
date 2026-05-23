'use client';

import { ArrowRight, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

type WatchlistItem = { symbol: string; company?: string };

export default function WatchlistSummaryCard({ data }: Props) {
  const router = useRouter();
  const items = (data.items as WatchlistItem[]) || [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 px-3 py-2.5">
        <span className="text-xs text-gray-500">Your watchlist is empty.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Star className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Watchlist ({items.length})</span>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.symbol}
            onClick={() => router.push(`/ta?symbol=${encodeURIComponent(item.symbol)}`)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-gray-700/50 transition-colors group"
          >
            <span className="font-medium text-gray-200 text-[11px]">{item.symbol}</span>
            {item.company && <span className="text-gray-500 text-[11px] truncate">{item.company}</span>}
            <ArrowRight className="h-3 w-3 text-gray-600 group-hover:text-gray-400 ml-auto shrink-0" />
          </button>
        ))}
      </div>
      <button
        onClick={() => router.push('/watchlist')}
        className="w-full text-center text-[10px] text-gray-500 hover:text-gray-300 py-0.5"
      >
        View full watchlist →
      </button>
    </div>
  );
}
