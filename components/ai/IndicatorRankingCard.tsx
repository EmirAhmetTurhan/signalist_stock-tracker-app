'use client';

import { BarChart3, Bookmark, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
  messageParts?: any[];
};

type RankedResult = { name: string; winRate: number; signals: number };

export default function IndicatorRankingCard({ data, toolName, messageParts }: Props) {
  const router = useRouter();
  const symbol = (data.symbol as string) || '';
  const results = (data.results as RankedResult[]) || (data.ranked as RankedResult[]) || (data.best as RankedResult[]) || [];
  const best = (data.best as RankedResult[])?.[0] || undefined;
  const isSingle = toolName === 'findBestIndicator';

  if (results.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        {isSingle ? <Trophy className="h-4 w-4 text-yellow-400" /> : <BarChart3 className="h-4 w-4 text-yellow-400" />}
        <span className="text-xs font-medium text-gray-200">
          {isSingle ? `Best Indicator: ${best?.name?.toUpperCase()}` : `Indicator Ranking for ${symbol}`}
        </span>
      </div>

      <div className="space-y-1">
        {results.slice(0, 5).map((r, i) => {
          const pct = Math.round(r.winRate);
          return (
            <div key={r.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-gray-800/60">
              <span className="text-[10px] text-gray-500 w-4">{i + 1}</span>
              <span className={`font-medium text-[11px] ${i === 0 && isSingle ? 'text-yellow-300' : 'text-gray-200'}`}>
                {r.name.toUpperCase()}
              </span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct >= 65 ? 'bg-emerald-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.max(pct, 5)}%` }}
                />
              </div>
              <span className={`text-[11px] font-medium ${pct >= 65 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {pct}%
              </span>
              <span className="text-[10px] text-gray-600">{r.signals}s</span>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => router.push('/archive')}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
      >
        <Bookmark className="h-3 w-3" /> Save to Notebook
      </button>
    </div>
  );
}
