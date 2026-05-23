'use client';

import { ArrowRight, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

type SearchResult = { symbol: string; name?: string; type?: string; country?: string };

export default function SearchResultsCard({ data }: Props) {
  const router = useRouter();
  const results = (data.results as SearchResult[]) || [];

  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 px-3 py-2.5">
        <span className="text-xs text-gray-500">No matching stocks found.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Search Results ({results.length})</span>
      <div className="space-y-1">
        {results.slice(0, 5).map((r) => (
          <button
            key={r.symbol}
            onClick={() => router.push(`/ta?symbol=${encodeURIComponent(r.symbol)}`)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs hover:bg-gray-700/50 transition-colors group"
          >
            <TrendingUp className="h-3 w-3 text-gray-500 group-hover:text-yellow-400" />
            <span className="font-medium text-gray-200">{r.symbol}</span>
            {r.name && <span className="text-gray-500 truncate">{r.name}</span>}
            {r.country && <span className="text-[10px] text-gray-600 ml-auto">{r.country}</span>}
            <ArrowRight className="h-3 w-3 text-gray-600 group-hover:text-gray-400 ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}
