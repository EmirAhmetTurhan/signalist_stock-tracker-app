// components/ta/DeepDiscoveryResults.tsx
// Displays deep discovery results with multi-metric columns (v3 pipeline).
// Supports both ValidatedStrategy (legacy cross-val) and DiscoveredStrategy
// (new MI→MCTS→Hyperband→DE→Portfolio) result formats.
//
// SAFETY: All field accesses use optional chaining (?.) and null-coalescing
// to prevent React "black screen" crashes on malformed/empty data.

"use client";

import { Gauge, Database, BarChart3, Clock, TrendingUp, Shield, Layers, Target, AlertCircle } from "lucide-react";
import { INDICATOR_DETAILS } from "@/lib/constants/indicator-categories";
import type { RiskLevel } from "@/lib/ta/discovery-types";
import { cn } from "@/lib/utils";

// ─── Display Interface ────────────────────────────────────────────────────────
// Accepts results from both old (ValidatedStrategy) and new (DiscoveredStrategy)
// pipelines. New pipeline fields (sharpeRatio, profitFactor, regimeBreakdown,
// compositeScore) are shown when available.

export interface DisplayStrategyResult {
    combo?: string[];         // Backend stores `combo` (DiscoveryStrategyResult) or `indicators` (DiscoveredStrategy)
    indicators?: string[];    // Fallback field name — see getIndicators()
    bestParams: Record<string, number>;
    winRate: number;
    totalSignals: number;

    // New multi-metric fields (v3 pipeline)
    sharpeRatio?: number;
    profitFactor?: number;
    maxDrawdown?: number;
    totalReturn?: number;
    compositeScore?: number;
    rank?: number;
    regimeBreakdown?: Record<string, {
        winRate: number;
        totalSignals: number;
        wins: number;
        avgReturn: number;
        totalReturn: number;
    }> | null;  // null-safe

    // Legacy fields (for backward compatibility with ValidatedStrategy)
    validatedWinRate?: number;
    overfittingRisk?: number;
    riskLevel?: RiskLevel;
}

interface DeepDiscoveryResultsProps {
    results: DisplayStrategyResult[];
    totalSaved: number;
    onApply: (strategy: DisplayStrategyResult) => void;
}

// ─── Helper: Normalize `combo` vs `indicators` field ──────────────────────────

function getIndicators(ds: DisplayStrategyResult): string[] {
    return ds.combo ?? ds.indicators ?? [];
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DeepDiscoveryResults({ results, totalSaved, onApply }: DeepDiscoveryResultsProps) {
    // ── Guard: Empty results → show empty state instead of crashing ──
    if (!results || results.length === 0) {
        return (
            <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-500/60 mx-auto" />
                <div>
                    <p className="text-sm text-gray-300 font-medium">No strategies discovered</p>
                    <p className="text-xs text-gray-500 mt-1">
                        The discovery engine did not find any viable strategies for this symbol/interval.
                        Try a different date range, interval, or symbol.
                    </p>
                </div>
            </div>
        );
    }

    // ── Safe: results[0] exists at this point ──
    const best = results[0];
    const bestIndicators = getIndicators(best);

    const getIndicatorLabel = (key: string) => {
        return INDICATOR_DETAILS.find(i => i.key === key)?.label ?? key.toUpperCase();
    };

    const getIndicatorColor = (key: string) => {
        return INDICATOR_DETAILS.find(i => i.key === key)?.color ?? '#a78bfa';
    };

    const renderRiskBadge = (risk: RiskLevel) => {
        if (risk === 'low') {
            return (
                <span title="Low Overfitting Risk" className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                    <Shield className="w-3 h-3" />
                    Stable
                </span>
            );
        }
        if (risk === 'medium') {
            return (
                <span title="Moderate Overfitting Risk" className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-900/30 border border-amber-700/40 px-2 py-0.5 rounded-full">
                    <Target className="w-3 h-3" />
                    Moderate Risk
                </span>
            );
        }
        return (
            <span title="High Overfitting Risk" className="flex items-center gap-1 text-[10px] text-red-400 bg-red-900/30 border border-red-700/40 px-2 py-0.5 rounded-full">
                <Target className="w-3 h-3" />
                High Risk
            </span>
        );
    };

    // ── Safe optional field checks ──
    const hasMultiMetrics = best.sharpeRatio !== undefined || best.profitFactor !== undefined;
    const hasRegimeBreakdown = best.regimeBreakdown != null && Object.keys(best.regimeBreakdown).length > 0;

    // ─── Type Guards ────────────────────────────────────────────────
    const hasValidatedFields = (ds: DisplayStrategyResult): ds is DisplayStrategyResult & { riskLevel: RiskLevel; overfittingRisk: number } =>
        'riskLevel' in ds && 'overfittingRisk' in ds;

    // Determine effective win rate (prefer validatedWinRate for legacy, fallback to winRate)
    const effectiveWinRate = (ds: DisplayStrategyResult) =>
        ds.validatedWinRate ?? ds.winRate;

    // Format sharpe ratio with color
    const renderSharpe = (sharpe?: number) => {
        if (sharpe === undefined) return null;
        const color = sharpe >= 1.5 ? 'text-emerald-400' : sharpe >= 0.5 ? 'text-yellow-400' : 'text-red-400';
        return (
            <span className={cn("text-[10px] font-medium", color)} title="Sharpe Ratio">
                S:{sharpe.toFixed(2)}
            </span>
        );
    };

    // Format profit factor with color
    const renderProfitFactor = (pf?: number) => {
        if (pf === undefined) return null;
        const color = pf >= 2.0 ? 'text-emerald-400' : pf >= 1.2 ? 'text-yellow-400' : 'text-red-400';
        return (
            <span className={cn("text-[10px] font-medium", color)} title="Profit Factor">
                PF:{pf.toFixed(2)}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Deep Discovery Results
                </h4>
                <span className="text-[10px] text-gray-500">
                    {hasMultiMetrics ? 'Multi-Metric Optimized' : `Top ${results.length} Cross-Validated`}
                </span>
            </div>

            {/* Best Strategy Highlight */}
            <div className="bg-gradient-to-r from-amber-900/30 to-violet-900/30 border border-amber-700/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                    <Gauge className="w-4 h-4 text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Best Strategy</span>
                    {totalSaved > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                            <Database className="w-3 h-3" />
                            Saved
                        </span>
                    )}
                </div>

                {/* Indicator badges — SAFE: uses getIndicators() with fallback to [] */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {bestIndicators.length > 0 ? (
                        bestIndicators.map(key => (
                            <span
                                key={key}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                                style={{
                                    backgroundColor: `${getIndicatorColor(key)}20`,
                                    borderColor: `${getIndicatorColor(key)}50`,
                                    color: getIndicatorColor(key),
                                }}
                            >
                                {getIndicatorLabel(key)}
                            </span>
                        ))
                    ) : (
                        <span className="text-[10px] text-gray-500 italic">No indicators</span>
                    )}
                </div>

                {/* Primary metrics row */}
                <div className="flex items-center gap-3 text-[11px] mb-2">
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <BarChart3 className="w-3 h-3" />
                        {(effectiveWinRate(best) ?? 0).toFixed(1)}% Win Rate
                    </span>
                    <span className="text-gray-400 flex items-center gap-1" title="Total Signals">
                        <Clock className="w-3 h-3" />
                        {best.totalSignals} sig
                    </span>
                    {best.rank && (
                        <span className="text-gray-500 text-[10px]">
                            Rank #{best.rank}
                        </span>
                    )}
                </div>

                {/* Multi-metric row (Sharpe, ProfitFactor, Drawdown) */}
                {hasMultiMetrics && (
                    <div className="flex items-center gap-3 text-[10px] mt-1 mb-2">
                        {renderSharpe(best.sharpeRatio)}
                        {renderProfitFactor(best.profitFactor)}
                        {best.maxDrawdown !== undefined && (
                            <span className="text-[10px] text-gray-500" title="Max Drawdown">
                                DD:{best.maxDrawdown.toFixed(1)}%
                            </span>
                        )}
                        {best.totalReturn !== undefined && (
                            <span className="text-[10px] text-gray-500" title="Total Return">
                                R:{best.totalReturn.toFixed(1)}%
                            </span>
                        )}
                        {best.compositeScore !== undefined && (
                            <span className="text-[10px] text-violet-400" title="Composite Score (MI×MCTS×DE)">
                                Score:{best.compositeScore.toFixed(2)}
                            </span>
                        )}
                    </div>
                )}

                {/* Regime Breakdown (collapsible) — SAFE: null check */}
                {hasRegimeBreakdown && best.regimeBreakdown && (
                    <details className="mt-2 group">
                        <summary className="text-[9px] text-gray-500 hover:text-gray-300 cursor-pointer flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" />
                            Regime Performance
                        </summary>
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                            {Object.entries(best.regimeBreakdown).map(([regime, stats]) => (
                                <div
                                    key={regime}
                                    className="text-[9px] bg-gray-900/50 border border-gray-800 rounded px-2 py-1 flex justify-between"
                                >
                                    <span className="text-gray-400 capitalize">{regime}</span>
                                    <span className="text-emerald-400 font-medium">
                                        {stats.winRate.toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Risk badge + Apply button */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-amber-900/30">
                    {hasValidatedFields(best)
                        ? renderRiskBadge(best.riskLevel)
                        : <span className="text-[10px] text-gray-500 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Optimized
                        </span>
                    }
                    <button
                        onClick={() => onApply(best)}
                        className="text-[10px] bg-amber-600 hover:bg-amber-500 text-black font-bold px-3 py-1.5 rounded transition-colors shadow-[0_0_10px_rgba(217,119,6,0.3)] hover:shadow-[0_0_15px_rgba(217,119,6,0.5)]"
                    >
                        Apply Strategy
                    </button>
                </div>
            </div>

            {/* Other Strategies List */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {results.slice(1).map((ds, idx) => {
                    const dsIndicators = getIndicators(ds);
                    return (
                        <div
                            key={idx}
                            className={cn(
                                "flex items-center gap-2 bg-gray-900/40 border border-gray-800 rounded-lg px-3 py-2.5 hover:bg-gray-900/70 transition-colors",
                                "group"
                            )}
                        >
                            <span className="text-[10px] font-bold w-5 text-center text-gray-500">
                                #{idx + 2}
                            </span>

                            {/* Indicators — SAFE: uses getIndicators() */}
                            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                {dsIndicators.length > 0 ? (
                                    dsIndicators.map(key => (
                                        <span
                                            key={key}
                                            className="text-[9px] px-1.5 py-0.5 rounded-full border"
                                            style={{
                                                backgroundColor: `${getIndicatorColor(key)}15`,
                                                borderColor: `${getIndicatorColor(key)}40`,
                                                color: getIndicatorColor(key),
                                            }}
                                        >
                                            {getIndicatorLabel(key)}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-[9px] text-gray-600 italic">No indicators</span>
                                )}
                            </div>

                            {/* Metrics column */}
                            <div className="flex flex-col items-end min-w-[55px]">
                                <span className={cn(
                                    "text-[11px] font-bold text-right",
                                    (effectiveWinRate(ds) ?? 0) >= 68 ? "text-emerald-400" :
                                        (effectiveWinRate(ds) ?? 0) >= 55 ? "text-yellow-400" : "text-red-400"
                                )}>
                                    %{(effectiveWinRate(ds) ?? 0).toFixed(1)}
                                </span>
                                {/* Multi-metric subtitles */}
                                {ds.sharpeRatio !== undefined && (
                                    <span className="text-[8px] text-gray-500">
                                        S:{ds.sharpeRatio.toFixed(2)}
                                    </span>
                                )}
                                {ds.profitFactor !== undefined && (
                                    <span className="text-[8px] text-gray-500">
                                        PF:{ds.profitFactor.toFixed(2)}
                                    </span>
                                )}
                                {!ds.sharpeRatio && !ds.profitFactor && hasValidatedFields(ds) && (
                                    <span className="text-[8px] text-gray-500">
                                        Risk:{(ds.overfittingRisk * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>

                            {/* Risk / Score badge */}
                            <div className="w-[75px] flex justify-end">
                                {hasValidatedFields(ds) ? (
                                    renderRiskBadge(ds.riskLevel)
                                ) : ds.compositeScore !== undefined ? (
                                    <span className="text-[9px] text-violet-400 font-medium">
                                        {ds.compositeScore.toFixed(2)}
                                    </span>
                                ) : (
                                    <span className="text-[9px] text-gray-600">—</span>
                                )}
                            </div>

                            <button
                                onClick={() => onApply(ds)}
                                className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                                Apply
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Auto-save notice */}
            {totalSaved > 0 && (
                <p className="text-[9px] text-gray-600 text-center flex items-center justify-center gap-1 mt-2">
                    <Database className="w-2.5 h-2.5" />
                    Top {totalSaved} strategies automatically saved to database
                </p>
            )}
        </div>
    );
}
