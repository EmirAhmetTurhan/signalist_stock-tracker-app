'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Tag, BookOpen, X, BarChart2, Sparkles, Timer, Layers, TrendingUp, AlertCircle } from 'lucide-react';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';
import ReportCard from '@/components/notebook/ReportCard';
import Link from 'next/link';

type Note = { id: string; title: string; symbol?: string; tags: string[]; createdAt: string; contentSnippet: string };

interface DiscoveryResultItem {
  combo: string[];
  validatedWinRate: number;
  rank: number;
  badge: string;
}

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
  // Discovery-specific fields
  type?: 'analysis' | 'discovery';
  discoveryResults?: DiscoveryResultItem[];
  discoveryConfig?: DiscoveryConfig;
  totalCombinationsScreened?: number;
  discoveryDuration?: number;
};

export default function NotebookSection() {
  const [activeTab, setActiveTab] = useState<'reports' | 'strategies' | 'notes'>('reports');
  const [notes, setNotes] = useState<Note[]>([]);
  const [reports, setReports] = useState<ReportType[]>([]);
  const [search, setSearch] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [selectedNote, setSelectedNote] = useState<{ id: string; title: string; symbol?: string; content: string; tags: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── Build filtered strategies list ──────────────────────────────────────────
  const strategies = reports.filter(r => r.type === 'discovery' && r.status === 'completed');
  const analysisReports = reports.filter(r => r.type !== 'discovery');

  // ─── Data loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'notes') {
        const { getUserNotes, searchNotes } = await import('@/lib/actions/analysis-notes.actions');
        const res = search.trim()
          ? await searchNotes(search)
          : await getUserNotes(filterSymbol || undefined);
        if (res.success && res.notes) setNotes(res.notes);
      } else {
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
              // Search by symbol
              if (r.symbol.toLowerCase().includes(q)) return true;
              // Search by indicator name (for analysis reports)
              if (r.indicator?.toLowerCase().includes(q)) return true;
              // Search inside discovery results (combo strings)
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
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, filterSymbol, activeTab]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { deleteNote } = await import('@/lib/actions/analysis-notes.actions');
    await deleteNote(id);
    if (selectedNote?.id === id) setSelectedNote(null);
    loadData();
  };

  const handleOpenNote = async (id: string) => {
    const { getNoteById } = await import('@/lib/actions/analysis-notes.actions');
    const res = await getNoteById(id);
    if (res.success && res.note) setSelectedNote(res.note);
  };

  const uniqueSymbols = activeTab === 'notes'
    ? [...new Set(notes.map((n) => n.symbol).filter(Boolean))].sort()
    : activeTab === 'strategies'
      ? [...new Set(strategies.map((r) => r.symbol).filter(Boolean))].sort()
      : [...new Set(analysisReports.map((r) => r.symbol).filter(Boolean))].sort();

  // ─── Render: Strategies Tab Table ────────────────────────────────────────────
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
          {/* Table Header */}
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left py-3 px-4 font-medium">Symbol</th>
              <th className="text-right py-3 px-4 font-medium">Best Win Rate</th>
              <th className="text-center py-3 px-4 font-medium">Data Range</th>
              <th className="text-right py-3 px-4 font-medium">Combos</th>
              <th className="text-right py-3 px-4 font-medium">Duration</th>
              <th className="text-right py-3 px-4 font-medium">Date</th>
              <th className="text-right py-3 px-4 font-medium">Top Strategy</th>
            </tr>
          </thead>
          {/* Table Body */}
          <tbody>
            {strategies.map((s) => {
              const topResult = s.discoveryResults?.[0];
              const durationSec = s.discoveryDuration ? Math.round(s.discoveryDuration / 1000) : null;
              return (
                <tr
                  key={s._id}
                  onClick={() => window.location.href = `/archive/reports/${s._id}`}
                  className="border-b border-gray-800/50 hover:bg-violet-900/10 cursor-pointer transition-colors"
                >
                  {/* Symbol */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      <span className="font-bold text-white">{s.symbol}</span>
                    </div>
                  </td>
                  {/* Best Win Rate */}
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-semibold text-amber-400">
                      %{s.winRate?.toFixed(1) ?? 'N/A'}
                    </span>
                  </td>
                  {/* Data Range (Years) */}
                  <td className="py-3.5 px-4 text-center text-gray-400">
                    {s.discoveryConfig?.years ?? '?'} Yıl
                  </td>
                  {/* Total Combinations */}
                  <td className="py-3.5 px-4 text-right text-gray-400">
                    {s.totalCombinationsScreened?.toLocaleString() ?? '-'}
                  </td>
                  {/* Duration */}
                  <td className="py-3.5 px-4 text-right text-gray-400">
                    <div className="flex items-center justify-end gap-1">
                      <Timer className="w-3 h-3" />
                      {durationSec !== null ? `${durationSec}s` : '-'}
                    </div>
                  </td>
                  {/* Date */}
                  <td className="py-3.5 px-4 text-right text-gray-400 text-xs whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  {/* Top Strategy Combo */}
                  <td className="py-3.5 px-4 text-right">
                    {topResult ? (
                      <span className="text-xs font-mono text-gray-300 truncate max-w-[140px] inline-block align-middle">
                        {topResult.combo.join(' + ')}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">-</span>
                    )}
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
          <BookOpen className="h-6 w-6 text-blue-500" />
          Archive
        </h2>
        <div className="flex gap-4 sm:ml-8">
          {/* Tab: AI Reports */}
          <button
            onClick={() => { setActiveTab('reports'); setSearch(''); setFilterSymbol(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'reports' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
          >
            <BarChart2 className="w-4 h-4" />
            AI Reports
          </button>
          {/* Tab: Strategies (NEW) */}
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
          {/* Tab: My Notes */}
          <button
            onClick={() => { setActiveTab('notes'); setSearch(''); setFilterSymbol(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notes' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
          >
            <BookOpen className="w-4 h-4" />
            My Notes
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
              activeTab === 'notes' ? "Search notes..." :
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
        ) : activeTab === 'notes' ? (
          /* ─── Notes Grid ─── */
          notes.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No notes yet</p>
              <p className="text-gray-600 text-xs mt-1">Save AI analysis results to build your research library</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpenNote(n.id)}
                  className="text-left p-4 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 hover:bg-gray-800 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-gray-200 line-clamp-1">{n.title}</h3>
                    <button onClick={(e) => handleDeleteNote(n.id, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded shrink-0 transition-all">
                      <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-red-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {n.symbol && (
                      <span className="text-[10px] font-mono text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                        {n.symbol}
                      </span>
                    )}
                    {n.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" />{t}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{n.contentSnippet}</p>
                  <p className="text-[10px] text-gray-600 mt-2">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )
        ) : activeTab === 'strategies' ? (
          /* ─── Strategies Table ─── */
          renderStrategiesTable()
        ) : (
          /* ─── Reports Grid ─── */
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

      {/* Note detail modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setSelectedNote(null)}>
          <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">{selectedNote.title}</h2>
                <div className="flex gap-2 mt-1">
                  {selectedNote.symbol && (
                    <span className="text-xs font-mono text-yellow-500">{selectedNote.symbol}</span>
                  )}
                  {selectedNote.tags.map((t) => (
                    <span key={t} className="text-xs text-gray-500">{t}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => setSelectedNote(null)} className="hover:bg-gray-700 rounded-lg p-1.5">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <MarkdownRenderer content={selectedNote.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
