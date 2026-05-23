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

type Props = {
  parts?: any[];
  isLoading?: boolean;
};

// AI SDK v6 tool-invocation → v4/v5 ToolPart formatina normalize et
function normalizePart(p: any): ToolPart | null {
  // v6: tool-invocation
  if (p.type === 'tool-invocation' && p.toolInvocation) {
    const inv = p.toolInvocation;
    if (inv.toolName === 'askClarification') return null;
    return {
      type: inv.state === 'result' ? 'tool-result' : 'tool-call',
      toolName: inv.toolName,
      toolCallId: inv.toolCallId,
      args: inv.input || inv.args,
      result: inv.result || inv.output?.value || inv.output,
    };
  }
  // v4/v5: tool-call / tool-result
  if ((p.type === 'tool-call' || p.type === 'tool-result') && p.toolName !== 'askClarification') {
    return p as ToolPart;
  }
  return null;
}

export default memo(function ToolProgress({ parts, isLoading = true }: Props) {
  if (!parts || parts.length === 0) return null;

  const toolParts = parts.map(normalizePart).filter((p): p is ToolPart => p !== null);

  if (toolParts.length === 0) return null;

  // Group by toolCallId
  const groups = new Map<string, { call: ToolPart; result?: ToolPart }>();
  for (const p of toolParts) {
    const id = p.toolCallId || '';
    const entry = groups.get(id) || { call: p.type === 'tool-call' ? p : ({} as ToolPart), result: undefined };
    if (p.type === 'tool-call') entry.call = p;
    if (p.type === 'tool-result') entry.result = p;
    groups.set(id, entry);
  }

  return (
    <div className="mt-2 space-y-1">
      {[...groups.entries()].map(([groupId, { call, result }]) => {
        const label = TOOL_LABELS[call.toolName || ''] || call.toolName || 'Processing';
        const info = getSymbolInfo(call.toolName || '', call.args);
        
        // Eger stream bittiyse (!isLoading) ve sonuc hala gelmediyse (!result), islem yari yolda kopmustur!
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
            <span>{isAborted ? `${label} (Aborted)` : label}</span>
            {info && <span className="text-[10px] opacity-60 ml-auto">{info}</span>}
          </div>
        );
      })}
    </div>
  );
});
