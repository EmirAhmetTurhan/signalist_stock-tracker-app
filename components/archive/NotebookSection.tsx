'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, BarChart2, Sparkles } from 'lucide-react';
import ReportCard from '@/components/notebook/ReportCard';
import Link from 'next/link';

interface DiscoveryConfig {
  symbol: string;
  interval: string;
  years: number;
}

type ReportType = {
  _id: string;
  symbol: string;
  indicator: string;
  status: string;
  bestValue?: number;
  winRate?: number;
  createdAt: string;
  errorMessage?: string;
  type?: 'analysis' | 'discovery';
  discoveryConfig?: DiscoveryConfig;
  totalCombinationsScreened?: number;
  discoveryDuration?: number;
};

export default function NotebookSection() {
  const [activeTab, setActiveTab] = useState<'strategies' | 'reports'>('strategies');
  const [reports, setReports] = useState<ReportType[]>([]);
  const [search, setSearch] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [loading, setLoading] = useState(true);

  const strategies = reports.filter(r => r.type === 'discovery' && r.status === 'completed');
  const analysisReports = reports.filter(r => r.type !== 'discovery');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { getAllReports } = await import('@/lib/actions/report.actions');
      const res = await getAllReports();
      if (res.success && res.reports) {
        let filtered = res.reports;
        if (filterSymbol) {
          filtered = filtered.filter((r: any) => r.symbol === filterSymbol);
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          filtered = filtered.filter((r: any) => {
            if (r.symbol.toLowerCase().includes(q)) return true;
            if (r.indicator?.toLowerCase().includes(q)) return true;
            if (r.type === 'discovery' && Array.isArray(r.discoveryResults)) {
              return r.discoveryResults.some((dr: any) =>
                Array.isArray(dr.combo) &&
                dr.combo.some((key: string) => key.toLowerCase().includes(q))
              );
            }
            return false;
          });
        }
        setReports(filtered);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, filterSymbol]);

  useEffect(() => { loadData(); }, [loadData]);

  const uniqueSymbols = activeTab === 'strategies'
    ? [...new Set(strategies.map((r) => r.symbol).filter(Boolean))].sort()
    : [...new Set(analysisReports.map((r) => r.symbol).filter(Boolean))].sort();

  // ─── Render: Strategies Tab Table ────────────────────────────────────────
  const renderStrategiesTable = () => {
    if (strategies.length === 0) {
      return (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">No strategy discoveries yet</p>
          <p className="text-gray-600 text-xs mt-1">Run a Deep Discovery from the TA panel or ask the AI</p>
        </div>
      );
    }

    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left py-3 px-4 font-medium">Symbol</th>
              <th className="text-right py-3 px-4 font-medium">Win Rate</th>
              <th className="text-center py-3 px-4 font-medium">Data Range</th>
              <th className="text-right py-3 px-4 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => {
              return (
                <tr
                  key={s._id}
                  onClick={() => window.location.href = `/archive/reports/${s._id}`}
                  className="border-b border-gray-800/50 hover:bg-violet-900/10 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span className="font-bold text-white">{s.symbol}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums">
                    <span className="font-semibold text-amber-400">
                      %{s.winRate?.toFixed(1) ?? 'N/A'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-gray-400">
                    {s.discoveryConfig?.years ?? '?'} Years
                  </td>
                  <td className="py-3.5 px-4 text-right text-gray-400 text-xs whitespace-nowrap tabular-nums">
                    {new Date(s.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-gray-900/20 border border-gray-800/50 rounded-2xl overflow-hidden mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 py-4 px-6 shrink-0 border-b border-gray-800/50 w-full bg-gray-900/40">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-blue-500" />
          Archive
        </h2>
        <div className="flex gap-4 sm:ml-8">
          {/* Tab: Strategies */}
          <button
            onClick={() => { setActiveTab('strategies'); setSearch(''); setFilterSymbol(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'strategies' ? 'border-violet-500 text-violet-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
          >
            <Sparkles className="w-4 h-4" />
            Strategies
            {strategies.length > 0 && (
              <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">
                {strategies.length}
              </span>
            )}
          </button>
          {/* Tab: AI Reports */}
          <button
            onClick={() => { setActiveTab('reports'); setSearch(''); setFilterSymbol(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'reports' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
          >
            <BarChart2 className="w-4 h-4" />
            AI Reports
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 px-6 py-4 w-full bg-black/20">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'strategies' ? "Search strategies by symbol or indicator..." :
                "Search reports by symbol or indicator..."
            }
            className="w-full bg-gray-800/80 border border-gray-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-colors"
          />
        </div>
        <select
          value={filterSymbol}
          onChange={(e) => { setFilterSymbol(e.target.value); setSearch(''); }}
          className="bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-500/50 transition-colors"
        >
          <option value="">All Symbols</option>
          {uniqueSymbols.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 w-full min-h-[300px] max-h-[65vh]">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : activeTab === 'strategies' ? (
          renderStrategiesTable()
        ) : (
          analysisReports.length === 0 ? (
            <div className="text-center py-12">
              <BarChart2 className="h-12 w-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No AI reports yet</p>
              <p className="text-gray-600 text-xs mt-1">Start an AI analysis in the chat to generate reports</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {analysisReports.map((report) => (
                <ReportCard key={report._id} report={report} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}