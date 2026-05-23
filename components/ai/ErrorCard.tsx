'use client';

import { XCircle, AlertTriangle, RefreshCw, ExternalLink, Search } from 'lucide-react';
import type { ErrorCode } from '@/lib/ai/error-codes';
import { ERROR_MAP } from '@/lib/ai/error-codes';

type Props = {
  errorCode?: string;
  userMessage?: string;
  recoverable?: boolean;
  onRetry?: () => void;
};

export default function ErrorCard({ errorCode, userMessage, recoverable, onRetry }: Props) {
  const code = (errorCode as ErrorCode) || 'INTERNAL_ERROR';
  const info = ERROR_MAP[code] || ERROR_MAP.INTERNAL_ERROR;
  const message = userMessage || info.userMessage;
  const canRetry = recoverable ?? info.recoverable;
  const action = info.action;

  const title =
    code === 'EXTERNAL_API_DENIED' ? 'Data Provider Error' :
    code === 'EXTERNAL_API_RATE_LIMIT' ? 'Rate Limit Reached' :
    code === 'EXTERNAL_API_TIMEOUT' ? 'Operation Timeout' :
    code === 'INSUFFICIENT_DATA' ? 'Insufficient Data' :
    code === 'INVALID_SYMBOL' ? 'Invalid Symbol' :
    'Analysis Failed';

  return (
    <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-red-400" />
        <span className="text-sm font-medium text-red-300">{title}</span>
        <span className="text-[10px] text-red-600/70 ml-auto font-mono">{code}</span>
      </div>

      {/* User-friendly message */}
      <div className="bg-red-900/20 border border-red-800/20 rounded-lg px-3 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">{message}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {canRetry && onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
        {action === 'check_api' && (
          <button
            onClick={() => window.open('https://finnhub.io/pricing', '_blank')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Check API Status
          </button>
        )}
        {action === 'try_different_symbol' && (
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-700/70 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-colors"
          >
            <Search className="h-3 w-3" /> Search Stocks
          </button>
        )}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-gray-600">
        {canRetry
          ? 'This is a temporary issue. You can retry or check a different symbol.'
          : 'This operation cannot be completed. Try a different symbol or timeframe.'}
      </p>
    </div>
  );
}
