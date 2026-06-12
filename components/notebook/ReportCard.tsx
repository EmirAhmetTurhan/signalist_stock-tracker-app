import React from 'react';
import Link from 'next/link';
import { ChevronRight, TrendingUp, Calendar, AlertCircle, Sparkles, Layers, Timer, Search, Trash2 } from 'lucide-react';

interface DiscoveryResultItem {
  combo: string[];
  validatedWinRate: number;
  rank: number;
  badge: string;
}

interface ReportCardProps {
  report: {
    _id: string;
    symbol: string;
    indicator: string;
    status: string;
    bestValue?: number;
    winRate?: number;
    createdAt: string;
    errorMessage?: string;
    // Discovery-specific fields
    type?: 'analysis' | 'discovery';
    discoveryResults?: DiscoveryResultItem[];
    totalCombinationsScreened?: number;
    discoveryDuration?: number;
  };
  onDelete?: (id: string) => void;
}

export default function ReportCard({ report, onDelete }: ReportCardProps) {
  const isError = report.status === 'failed';
  const isProcessing = report.status === 'processing';
  const isSuccess = report.status === 'completed';
  const isDiscovery = report.type === 'discovery';

  const date = new Date(report.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Discovery report rendering
  if (isDiscovery) {
    const topResults = report.discoveryResults?.slice(0, 3) ?? [];
    const durationSec = report.discoveryDuration
      ? Math.round(report.discoveryDuration / 1000)
      : null;

    return (
      <Link href={`/archive/reports/${report._id}`}>
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/40 via-gray-900/30 to-gray-950/40 border border-violet-800/40 hover:border-violet-600/60 hover:from-violet-900/40 transition-all duration-300 p-6 flex flex-col justify-between h-full min-h-[180px]">
          {/* Background accent */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl pointer-events-none" />

          {/* Top Section */}
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                {report.symbol}
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Discovery
                </span>
              </h3>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {date}
              </p>
            </div>

            <div className="flex items-start gap-3">
              {isSuccess && report.winRate && (
                <div className="flex flex-col items-end">
                  <div className="text-2xl font-bold text-amber-400 flex items-center gap-1">
                    %{report.winRate}
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Best Win Rate</span>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-end">
                  <AlertCircle className="w-6 h-6 text-red-500 mb-1" />
                  <span className="text-xs text-red-400">Failed</span>
                </div>
              )}

              {onDelete && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(report._id); }}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete Report"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Discovery-specific content */}
          {isSuccess && topResults.length > 0 && (
            <div className="space-y-1.5 mb-4 relative z-10">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Top Strategies
              </p>
              {topResults.map((dr, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 font-mono truncate max-w-[180px]">
                    {dr.combo.join(' + ')}
                  </span>
                  <span className="text-green-400 font-semibold shrink-0 ml-2">
                    %{dr.validatedWinRate.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Section */}
          <div className="mt-auto pt-3 border-t border-violet-800/20 flex justify-between items-center relative z-10">
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              {report.totalCombinationsScreened !== undefined && (
                <span className="flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  {report.totalCombinationsScreened.toLocaleString()} combos
                </span>
              )}
              {durationSec !== null && (
                <span className="flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  {durationSec}s
                </span>
              )}
            </div>

            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-violet-500/20 group-hover:text-violet-400 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-violet-400" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Standard analysis report rendering
  return (
    <Link href={`/archive/reports/${report._id}`}>
      <div className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300 p-6 flex flex-col justify-between h-full min-h-[160px]">
        {/* Top Section */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              {report.symbol}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
                {report.indicator}
              </span>
            </h3>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {date}
            </p>
          </div>

          <div className="flex items-start gap-3">
            {isSuccess && report.winRate && (
              <div className="flex flex-col items-end">
                <div className="text-2xl font-bold text-green-400 flex items-center gap-1">
                  %{report.winRate}
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-end">
                <AlertCircle className="w-6 h-6 text-red-500 mb-1" />
                <span className="text-xs text-red-400">Failed</span>
              </div>
            )}

            {onDelete && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(report._id); }}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete Report"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center">
          <div className="text-sm text-gray-300">
            {isProcessing && <span className="text-blue-400 animate-pulse">Analiz Devam Ediyor...</span>}
            {isError && <span className="text-red-400 text-xs line-clamp-1">{report.errorMessage || 'Bir hata oluştu'}</span>}
            {isSuccess && report.bestValue !== undefined && (
              <span className="text-gray-400">Best Param: <strong className="text-white">{report.bestValue}</strong></span>
            )}
          </div>

          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-400" />
          </div>
        </div>
      </div>
    </Link>
  );
}
