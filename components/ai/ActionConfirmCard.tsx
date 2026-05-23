'use client';

import { CheckCircle2 } from 'lucide-react';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

const LABELS: Record<string, string> = {
  addToWatchlist: 'Added to watchlist',
  removeFromWatchlist: 'Removed from watchlist',
  createPriceAlert: 'Price alert created',
  deletePriceAlert: 'Price alert deleted',
  createSmartAlert: 'Smart alert created',
};

export default function ActionConfirmCard({ toolName, data }: Props) {
  const label = LABELS[toolName] || `${toolName} completed`;
  const sym = (data.symbol as string) || '';

  return (
    <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-300">
          {label}{sym ? `: ${sym}` : ''}
        </span>
      </div>
    </div>
  );
}
