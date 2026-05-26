'use client';

import { memo } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

type ToolPart = {
  type: 'tool-call' | 'tool-result';
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: { success?: boolean; error?: string };
};

const TOOL_LABELS: Record<string, string> = {
  analyzeIndicators: 'Computing technical indicators',
  getCurrentPrice: 'Fetching current price',
  searchStock: 'Searching stocks',
  getWatchlist: 'Loading watchlist',
  addToWatchlist: 'Adding to watchlist',
  removeFromWatchlist: 'Removing from watchlist',
  getMarketNews: 'Fetching market news',
  createPriceAlert: 'Creating price alert',
  deletePriceAlert: 'Deleting price alert',
  getUserAlerts: 'Loading alerts',
  runBacktest: 'Running backtest',
  optimizeParameter: 'Optimizing parameters',
  rankIndicators: 'Ranking indicators',
  findBestIndicator: 'Finding best indicator',
  createSmartAlert: 'Creating smart alert',
  getSmartAlerts: 'Loading smart alerts',
};

function getSymbolInfo(toolName: string, args?: Record<string, unknown>): string {
  if (!args) return '';
  const symbol = args.symbol as string | undefined;
  const indicator = args.indicator as string | undefined;
  const indicators = args.indicators as string[] | undefined;

  if (symbol && indicator) return `${symbol} (${indicator.toUpperCase()})`;
  if (symbol && indicators) return `${symbol} (${indicators.join(', ').toUpperCase()})`;
  if (symbol) return symbol;
  if (indicator) return indicator.toUpperCase();
  return '';
}

import { normalizePart, type CanonicalPart } from '@/lib/ai/message-format';

type Props = {
  parts?: any[];
  isLoading?: boolean;
};

export default memo(function ToolProgress({ parts, isLoading = true }: Props) {
  if (!parts || parts.length === 0) return null;

  const toolParts = parts
    .map(normalizePart)
    .filter((p): p is CanonicalPart => p !== null && (p.type === 'tool-call' || p.type === 'tool-result'));

  if (toolParts.length === 0) return null;

  // Group by toolCallId
  const groups = new Map<string, { call: any; result?: any }>();
  for (const p of toolParts) {
    if (p.type !== 'tool-call' && p.type !== 'tool-result') continue;
    // Skip askClarification from showing a progress bar
    if ((p as any).toolName === 'askClarification') continue;

    const id = (p as any).toolCallId || '';
    const entry = groups.get(id) || { call: p.type === 'tool-call' ? p : ({} as any), result: undefined };
    if (p.type === 'tool-call') entry.call = p;
    if (p.type === 'tool-result') entry.result = p;
    groups.set(id, entry);
  }

  return (
    <div className="mt-2 space-y-1">
      {[...groups.entries()].map(([groupId, { call, result }]) => {
        const toolName = call.toolName as string || '';
        const args = call.input || call.args;
        const label = TOOL_LABELS[toolName] || toolName || 'Processing';
        const info = getSymbolInfo(toolName, args);
        
        // Arka plan işleri için LiveAnalysisCard veya BatchCard devreye girer,
        // ToolProgress'in minik hap barına (ve sahte Aborted hatasına) gerek yoktur.
        const isBackgroundTool = ['optimizeParameter', 'batchOptimizeParameter', 'rankIndicators', 'findBestIndicator'].includes(toolName);
        if (isBackgroundTool) return null;

        // Normal (senkron) araçlar için:
        // Eğer stream bittiyse (!isLoading) ve sonuc hala gelmediyse (!result), islem yari yolda kopmustur!
        const isDone = !!result;
        const isAborted = !isDone && !isLoading;
        const isError = result?.result?.error != null || isAborted;

        return (
          <div
            key={groupId || call.toolCallId || call.toolName}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
              isError
                ? 'bg-red-900/20 text-red-400 border border-red-800/30'
                : isDone
                ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/30'
                : 'bg-gray-800/60 text-gray-400 border border-gray-700/30'
            }`}
          >
            {!isDone && !isError ? (
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            ) : isError ? (
              <XCircle className="h-3 w-3 shrink-0" />
            ) : (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            )}
            <span>{isAborted ? `${label} (İptal Edildi/Zaman Aşımı)` : label}</span>
            {info && <span className="text-[10px] opacity-60 ml-auto">{info}</span>}
          </div>
        );
      })}
    </div>
  );
});
