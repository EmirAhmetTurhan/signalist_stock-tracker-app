// components/ta/BacktestLogPanel.tsx — Expandable trade log panel for backtest debugging
// Displays per-bar indicator signals, DST fusion, gate checks, and rejection reasons.
'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BacktestLogEntry, IndicatorLogEntry } from '@/lib/ta/backtest-log';

// ─── Props ───────────────────────────────────────────────────────────────────

interface BacktestLogPanelProps {
    /** Full debug log from runStrategyBacktest result */
    log: BacktestLogEntry[];
    /** Asset symbol for context */
    symbol?: string;
    /** Total candles in the backtest run (to show coverage %) */
    totalCandles?: number;
    /** When true, the panel starts expanded */
    defaultExpanded?: boolean;
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

function signalColor(signal: 'BUY' | 'SELL' | null): string {
    if (signal === 'BUY') return 'text-emerald-400';
    if (signal === 'SELL') return 'text-red-400';
    return 'text-gray-500';
}

function signalBg(signal: 'BUY' | 'SELL' | null): string {
    if (signal === 'BUY') return 'bg-emerald-500/10';
    if (signal === 'SELL') return 'bg-red-500/10';
    return 'bg-gray-800/30';
}

function gateStatusColor(passed: boolean): string {
    return passed ? 'text-emerald-400' : 'text-red-400';
}

// ─── Filter Definitions ──────────────────────────────────────────────────────

type LogFilter = 'all' | 'trades' | 'rejected' | 'buy' | 'sell';

const FILTER_OPTIONS: { key: LogFilter; label: string }[] = [
    { key: 'all', label: 'All Bars' },
    { key: 'trades', label: 'Trades Only' },
    { key: 'rejected', label: 'Rejected Only' },
    { key: 'buy', label: 'Buy Signals' },
    { key: 'sell', label: 'Sell Signals' },
];

// ─── Sub-Components ──────────────────────────────────────────────────────────

function IndicatorBadge({ entry }: { entry: IndicatorLogEntry }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono',
                signalBg(entry.signal),
                signalColor(entry.signal),
            )}
            title={`${entry.key}: ${entry.signal ?? 'NO SIGNAL'} | Crossover: ${entry.freshCrossover ? '✓' : '✗'} | Regime: ${entry.regime}`}
        >
            <span className="font-semibold">{entry.key}</span>
            <span>{entry.signal ?? '—'}</span>
            {entry.freshCrossover && <span className="text-emerald-400">⚡</span>}
        </span>
    );
}

function GateRow({ gates }: { gates: BacktestLogEntry['gates'] }) {
    const items = [
        { label: 'Crossover', ok: gates.freshCrossoverOk },
        { label: 'Cooldown', ok: gates.cooldownOk },
        { label: 'Threshold', ok: gates.thresholdOk },
    ];

    return (
        <div className="flex items-center gap-2 text-[10px] font-mono">
            {items.map((item) => (
                <span
                    key={item.label}
                    className={cn(
                        'px-1 py-0.5 rounded',
                        item.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
                    )}
                >
                    {item.label}: {item.ok ? '✓' : '✗'}
                </span>
            ))}
            <span className="text-gray-500 ml-1">CD={gates.cooldownValue}</span>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BacktestLogPanel({
    log,
    symbol,
    totalCandles,
    defaultExpanded = false,
}: BacktestLogPanelProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [filter, setFilter] = useState<LogFilter>('all');
    const [showFilters, setShowFilters] = useState(false);

    // ── Summary Stats ──
    const stats = useMemo(() => {
        const total = log.length;
        const trades = log.filter((e) => e.decision !== null).length;
        const buys = log.filter((e) => e.decision === 'BUY').length;
        const sells = log.filter((e) => e.decision === 'SELL').length;
        const wins = log.filter((e) => e.tradeOutcome?.isWin).length;
        const losses = log.filter((e) => e.tradeOutcome && !e.tradeOutcome.isWin).length;
        const winRate = trades > 0 ? (wins / trades) * 100 : 0;
        const coverage = totalCandles && totalCandles > 0 ? ((total / totalCandles) * 100).toFixed(1) : null;
        return { total, trades, buys, sells, wins, losses, winRate, coverage };
    }, [log, totalCandles]);

    // ── Filtered Log ──
    const filteredLog = useMemo(() => {
        switch (filter) {
            case 'trades':
                return log.filter((e) => e.decision !== null);
            case 'rejected':
                return log.filter((e) => e.decision === null);
            case 'buy':
                return log.filter((e) => e.decision === 'BUY');
            case 'sell':
                return log.filter((e) => e.decision === 'SELL');
            default:
                return log;
        }
    }, [log, filter]);

    // ── Toggle row expansion ──
    const toggleRow = useCallback((idx: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    // ── Export JSON ──
    const handleExport = useCallback(() => {
        const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backtrace-log-${symbol ?? 'unknown'}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [log, symbol]);

    // ── Empty state ──
    if (log.length === 0) {
        return (
            <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Filter className="h-4 w-4" />
                    No debug log entries. Run backtest with <code className="text-gray-300">debugLog: true</code> to enable.
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 overflow-hidden">
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <button className="text-gray-400 hover:text-gray-200 transition-colors">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-medium text-gray-200">Trade Log</span>
                    {symbol && <span className="text-xs text-gray-500">({symbol})</span>}
                </div>

                {/* Stats badges */}
                <div className="flex items-center gap-2 ml-auto text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-gray-700/50 text-gray-300">
                        {stats.total} bars
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                        {stats.trades} trades
                    </span>
                    <span className={cn('px-2 py-0.5 rounded', stats.winRate >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                        WR {stats.winRate.toFixed(1)}%
                    </span>
                    {stats.coverage !== null && (
                        <span className="px-2 py-0.5 rounded bg-gray-700/50 text-gray-400">
                            {stats.coverage}% coverage
                        </span>
                    )}
                </div>

                {/* Export button */}
                <button
                    onClick={(e) => { e.stopPropagation(); handleExport(); }}
                    className="p-1 hover:bg-gray-700/50 rounded transition-colors text-gray-400 hover:text-gray-200"
                    title="Export JSON"
                >
                    <Download className="h-3.5 w-3.5" />
                </button>
            </div>

            {expanded && (
                <>
                    {/* ── Filter bar ── */}
                    <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-700/30 bg-gray-900/30">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="px-2 py-1 rounded text-[10px] font-medium bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 transition-colors"
                        >
                            Filter
                        </button>
                        {showFilters && (
                            <div className="flex items-center gap-1">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.key}
                                        onClick={() => setFilter(opt.key)}
                                        className={cn(
                                            'px-2 py-1 rounded text-[10px] font-medium transition-colors',
                                            filter === opt.key
                                                ? 'bg-violet-500/20 text-violet-300'
                                                : 'bg-gray-700/30 text-gray-400 hover:bg-gray-600/30',
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {filter !== 'all' && (
                            <button
                                onClick={() => { setFilter('all'); setShowFilters(false); }}
                                className="ml-1 p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/30"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                        <span className="ml-auto text-[10px] text-gray-500">
                            Showing {filteredLog.length} of {stats.total} entries
                        </span>
                    </div>

                    {/* ── Table ── */}
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 bg-gray-800 z-10">
                                <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                                    <th className="py-2 px-3 text-left w-6"></th>
                                    <th className="py-2 px-3 text-left">Date</th>
                                    <th className="py-2 px-3 text-right">Price</th>
                                    <th className="py-2 px-3 text-left">Decision</th>
                                    <th className="py-2 px-3 text-left">Indicators</th>
                                    <th className="py-2 px-3 text-left">Gates</th>
                                    <th className="py-2 px-3 text-left">Rejection</th>
                                    <th className="py-2 px-3 text-right">Return</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLog.map((entry, idx) => {
                                    const isExpanded = expandedRows.has(idx);
                                    const tradeReturn = entry.tradeOutcome?.rawReturn;
                                    const isWin = entry.tradeOutcome?.isWin;

                                    return (
                                        <tr
                                            key={`${entry.barIndex}-${idx}`}
                                            className={cn(
                                                'border-b border-gray-700/20 hover:bg-gray-700/20 transition-colors',
                                                entry.decision !== null && 'bg-gray-700/10',
                                                isWin === true && 'bg-emerald-500/5',
                                                isWin === false && 'bg-red-500/5',
                                            )}
                                        >
                                            {/* Expand button */}
                                            <td className="py-1.5 px-3">
                                                <button
                                                    onClick={() => toggleRow(idx)}
                                                    className="text-gray-500 hover:text-gray-300 transition-colors"
                                                >
                                                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                </button>
                                            </td>

                                            {/* Date */}
                                            <td className="py-1.5 px-3 font-mono text-gray-300 whitespace-nowrap">
                                                {typeof entry.date === 'number'
                                                    ? new Date(entry.date).toISOString().slice(0, 10)
                                                    : String(entry.date).slice(0, 10)}
                                            </td>

                                            {/* Price */}
                                            <td className="py-1.5 px-3 text-right font-mono text-gray-400">
                                                {entry.price.toFixed(2)}
                                            </td>

                                            {/* Decision */}
                                            <td className="py-1.5 px-3">
                                                <span className={cn('font-semibold', signalColor(entry.decision))}>
                                                    {entry.decision ?? '—'}
                                                </span>
                                            </td>

                                            {/* Indicators (compact) */}
                                            <td className="py-1.5 px-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {entry.indicatorSignals.map((ind) => (
                                                        <span
                                                            key={ind.key}
                                                            className={cn(
                                                                'text-[9px] font-mono px-1 rounded',
                                                                signalBg(ind.signal),
                                                                signalColor(ind.signal),
                                                            )}
                                                        >
                                                            {ind.key}:{ind.signal?.[0] ?? '∅'}
                                                            {ind.freshCrossover ? '⚡' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>

                                            {/* Gates */}
                                            <td className="py-1.5 px-3">
                                                {entry.gates ? (
                                                    <div className="flex items-center gap-1 text-[9px] font-mono">
                                                        <span className={gateStatusColor(entry.gates.freshCrossoverOk)}>
                                                            FC{entry.gates.freshCrossoverOk ? '✓' : '✗'}
                                                        </span>
                                                        <span className={gateStatusColor(entry.gates.cooldownOk)}>
                                                            CD{entry.gates.cooldownOk ? '✓' : '✗'}
                                                        </span>
                                                        <span className={gateStatusColor(entry.gates.thresholdOk)}>
                                                            TH{entry.gates.thresholdOk ? '✓' : '✗'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>

                                            {/* Rejection reason */}
                                            <td className="py-1.5 px-3 max-w-[200px]">
                                                {entry.rejectionReason ? (
                                                    <span className="text-gray-400 text-[10px] truncate block" title={entry.rejectionReason}>
                                                        {entry.rejectionReason}
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-400/60 text-[10px]">ACCEPTED</span>
                                                )}
                                            </td>

                                            {/* Return */}
                                            <td className="py-1.5 px-3 text-right">
                                                {tradeReturn !== undefined ? (
                                                    <span className={cn(
                                                        'font-mono font-medium',
                                                        isWin ? 'text-emerald-400' : 'text-red-400',
                                                    )}>
                                                        {(tradeReturn * 100).toFixed(2)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Footer Summary ── */}
                    <div className="px-4 py-2 border-t border-gray-700/30 bg-gray-900/30 flex items-center gap-4 text-[10px] text-gray-400">
                        <span>Total bars logged: <strong className="text-gray-200">{stats.total}</strong></span>
                        <span>Trades: <strong className="text-emerald-400">{stats.trades}</strong></span>
                        <span>Wins: <strong className="text-emerald-400">{stats.wins}</strong></span>
                        <span>Losses: <strong className="text-red-400">{stats.losses}</strong></span>
                        <span>Win Rate: <strong className={stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>{stats.winRate.toFixed(1)}%</strong></span>
                        {stats.coverage !== null && (
                            <span>Coverage: <strong className="text-gray-200">{stats.coverage}%</strong></span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
