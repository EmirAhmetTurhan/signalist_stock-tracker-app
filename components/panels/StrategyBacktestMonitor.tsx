"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AVAILABLE_INDICATORS } from "@/components/strategies/constants";
import type { StrategyMode, Timeframe } from "@/lib/ta/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { History, CheckCircle2, XCircle, TrendingUp, TrendingDown, Loader2, Zap, RotateCcw, BarChart3, Download } from "lucide-react";
import { optimizeStrategyAction } from "@/lib/actions/optimize-strategy.actions";
import { runBacktestAction } from "@/lib/actions/backtest.actions";

import type { AllData } from "@/lib/ta/strategy-optimizer/types";
import type { Candle } from "@/lib/ta/types";
import { PARAM_DEFAULTS_NUM } from "@/lib/constants/indicator-params";

function sanitizeClientParams(params: Record<string, number> | null | undefined): Record<string, number> | null {
    if (!params) return null;
    const sanitized: Record<string, number> = {};
    for (const [key, val] of Object.entries(params)) {
        if (key === 'lookForward' || key.toLowerCase() in PARAM_DEFAULTS_NUM) {
            sanitized[key] = val;
        }
    }
    return sanitized;
}

export interface AllIndicatorData extends AllData {}

type Series = { time: string | number; value?: number }[];

export type HistoryItem = {
    time: string | number;
    signal: "BUY" | "SELL";
    price: number;
    futurePrice: number;
    isWin: boolean;
    mfe?: number;
    mae?: number;
    exitReason?: string;
    barsHeld?: number;
    realizedReturn?: number;
};

interface StrategyBacktestMonitorProps {
    strategyName: string;
    symbol: string;
    candles: Candle[];
    rsiData?: AllIndicatorData["rsiData"];
    cciData?: AllIndicatorData["cciData"];
    waveTrendData?: AllIndicatorData["waveTrendData"];
    customIndicators?: string[];
    allData?: AllIndicatorData;
    config?: { lookForward: number };
    mode?: StrategyMode;
    interval?: Timeframe;
    initialOptimizedParams?: Record<string, number>;
    discoveryWinRate?: number;
    discoverySignalCount?: number;
    isDiscovered?: boolean;
    /** Signal profile for backtest sensitivity. Defaults to 'TrendFollower'
     *  to match Phase 4.5 full-fidelity backtest in discovery-deep-search. */
    signalProfile?: 'TrendFollower' | 'SwingTrader' | 'Aggressive' | 'Balanced' | 'Conservative';
    onOptimized?: (params: Record<string, number>, winRate: number, totalSignals: number) => void;
    onReset?: () => void;
}

export default function StrategyBacktestMonitor({
    strategyName,
    symbol,
    candles,
    rsiData,
    cciData,
    waveTrendData,
    customIndicators,
    allData,
    config = { lookForward: 5 },
    mode = 'majority',
    interval = '1d',
    initialOptimizedParams,
    discoveryWinRate,
    discoverySignalCount,
    isDiscovered,
    signalProfile = 'TrendFollower',
    onOptimized,
    onReset,
}: StrategyBacktestMonitorProps) {
    const [stats, setStats] = useState<{
        winRate: number;
        totalSignals: number;
        wins: number;
        history: HistoryItem[];
        avgBarsHeld?: number;
        exitReasonBreakdown?: Record<string, number>;
        equityCurve?: { time: string | number; equity: number }[];
        finalEquity?: number;
        cagr?: number;
        profitFactor?: number;
        totalReturn?: number;
        avgWin?: number;
        avgLoss?: number;
    }>({
        winRate: 0,
        totalSignals: 0,
        wins: 0,
        history: [],
    });
    const [animatedPercent, setAnimatedPercent] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [applyMarketFilter, setApplyMarketFilter] = useState(false);
    const [optimizedParams, setOptimizedParams] = useState<Record<string, number> | null>(() => sanitizeClientParams(initialOptimizedParams));
    const [optimizedWinRate, setOptimizedWinRate] = useState<number>(discoveryWinRate ?? 0);

    const isCustom = strategyName === "CUSTOM" && customIndicators && allData;
    const isAIDiscovered = isDiscovered ?? !!(discoveryWinRate && discoveryWinRate > 0);

    // Ref to track if we just successfully completed an optimization step
    const hasJustOptimized = useRef(false);

    const handleOptimize = useCallback(async () => {
        if (!candles || candles.length === 0) return;
        if (!isCustom && strategyName !== "RSI_CCI_WT") return;

        setIsOptimizing(true);
        try {
            const indicators = isCustom && customIndicators
                ? customIndicators
                : ['rsi', 'cci', 'wavetrend'];

            const result = await optimizeStrategyAction(
                symbol,
                indicators,
                { 
                    interval, 
                    mode, 
                    strategyName,
                    currentParams: optimizedParams ?? undefined
                }
            );

            if (result.iterations > 0) {
                hasJustOptimized.current = true;
                setOptimizedParams(sanitizeClientParams(result.bestParams));
                setOptimizedWinRate(result.bestWinRate);
                setAnimatedPercent(result.bestWinRate);
            }
        } catch (err) {
            console.error('[StrategyBacktestMonitor] Optimize failed:', err);
            setOptimizedParams(null);
            setOptimizedWinRate(0);
        } finally {
            setIsOptimizing(false);
        }
    }, [candles, symbol, isCustom, customIndicators, interval, mode, strategyName]);

    const handleResetParams = useCallback(() => {
        if (initialOptimizedParams) {
            setOptimizedParams(sanitizeClientParams(initialOptimizedParams));
            setOptimizedWinRate(discoveryWinRate ?? 0);
        } else {
            setOptimizedParams(null);
            setOptimizedWinRate(0);
        }
        // Always animate back to the live backtest result
        setAnimatedPercent(stats.winRate);

        if (onReset) {
            onReset();
        }
    }, [initialOptimizedParams, discoveryWinRate, stats.winRate, onReset]);

    // ── Memoize customIndicators to prevent infinite useEffect re-runs
    const customIndicatorsKey = useMemo(
        () => (customIndicators ? JSON.stringify([...customIndicators].sort()) : ''),
        [customIndicators],
    );

    const optimizedParamsKey = useMemo(
        () => (optimizedParams ? JSON.stringify(optimizedParams) : ''),
        [optimizedParams],
    );

    // ── Server-side backtest using DST fusion + path-aware engine ──
    useEffect(() => {
        if (!candles || candles.length === 0) return;

        let cancelled = false;
        setIsLoading(true);

        async function runBacktest() {
            try {
                const result = await runBacktestAction(
                    symbol,
                    strategyName,
                    {
                        lookForward: optimizedParams?.lookForward ?? config.lookForward,
                        interval,
                        customIndicators: customIndicators,
                        mode,
                        signalProfile,
                        evaluationMode: 'pathaware',
                        parameterOverrides: optimizedParams ?? undefined,
                        applyMarketFilter,
                    }
                );

                if (cancelled) return;

                const history: HistoryItem[] = result.history.map(h => ({
                    time: h.time,
                    signal: h.signal,
                    price: h.price,
                    futurePrice: h.futurePrice,
                    isWin: h.isWin,
                    mfe: h.mfe,
                    mae: h.mae,
                    exitReason: h.exitReason,
                    barsHeld: h.barsHeld,
                    realizedReturn: h.realizedReturn,
                }));

                setStats({
                    winRate: result.winRate,
                    totalSignals: result.totalSignals,
                    wins: result.wins,
                    history,
                    avgBarsHeld: result.avgBarsHeld,
                    exitReasonBreakdown: result.exitReasonBreakdown,
                    equityCurve: result.equityCurve,
                    finalEquity: result.finalEquity,
                    cagr: result.cagr,
                    profitFactor: result.profitFactor,
                    totalReturn: result.totalReturn,
                    avgWin: result.avgWin,
                    avgLoss: result.avgLoss,
                });

                // Trigger onOptimized once we have computed the exact winRate and totalSignals
                if (hasJustOptimized.current) {
                    hasJustOptimized.current = false;
                    if (onOptimized && optimizedParams) {
                        onOptimized(optimizedParams, result.winRate, result.totalSignals);
                    }
                }

                // Animate circle toward the LIVE backtest win rate (not discovery static value)
                const targetRate = result.winRate;
                const timer = setTimeout(() => setAnimatedPercent(targetRate), 300);
                return () => clearTimeout(timer);
            } catch (err) {
                console.error('[StrategyBacktestMonitor] Server backtest failed:', err);
                if (!cancelled) {
                    setStats(prev => ({ ...prev, history: [] }));
                }
            } finally {
                setIsLoading(false);
            }
        }

        runBacktest();

        return () => { cancelled = true; };
    }, [candles, symbol, isCustom, customIndicatorsKey, interval, mode, strategyName, optimizedParamsKey, signalProfile, applyMarketFilter, onOptimized]);

    // ── UI ────────────────────────────────────────────────────────
    // displayRate always reflects the LIVE backtest result (stats.winRate).
    // discoveryWinRate is only used as a fallback before the first backtest completes.
    // optimizedWinRate is shown in the "Optimized" badge, not in the main circle.
    const displayRate = stats.totalSignals > 0
        ? stats.winRate
        : (discoveryWinRate ?? 0);

    const size = 64, strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (displayRate / 100) * circumference;

    let colorClass = "text-gray-500";
    if (displayRate >= 68) colorClass = "text-emerald-300 drop-shadow-[0_0_12px_rgba(110,231,183,0.7)]";
    else if (displayRate >= 62) colorClass = "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.6)]";
    else if (displayRate >= 55) colorClass = "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    else if (displayRate >= 48) colorClass = "text-yellow-500";
    else if (displayRate > 0) colorClass = "text-red-500";

    const displayInds = isCustom
        ? customIndicators!.map(k => AVAILABLE_INDICATORS.find(i => i.key === k)?.label ?? k)
        : ["RSI", "CCI", "WT"];

    const handleDownloadCSV = () => {
        const generated = new Date().toLocaleDateString();
        const strategyLabel = strategyName === "CUSTOM"
            ? `Custom (${displayInds.join(" + ")})`
            : strategyName;

        const metadata = [
            `Symbol: ${symbol.toUpperCase()}`,
            `Timeframe: ${interval}`,
            `Strategy: ${strategyLabel}`,
            `Generated: ${generated}`,
            ""
        ];

        const headers = ["Date", "Signal", "Entry Price", "Exit Price", "Bars Held", "Exit Reason", "Outcome"];
        const rows = stats.history.map(item => {
            const date = typeof item.time === 'number'
                ? new Date(item.time * 1000).toLocaleDateString()
                : item.time;
            return [
                date,
                item.signal,
                item.price.toFixed(2),
                item.futurePrice.toFixed(2),
                item.barsHeld ?? '—',
                item.exitReason ? item.exitReason.replace(/_/g, ' ') : 'lookforward',
                item.isWin ? "HIT" : "MISS"
            ];
        });
        const csvContent = [
            ...metadata,
            headers.join(","),
            ...rows.map(e => e.map(val => `"${val}"`).join(","))
        ].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `strategy_history_${symbol}_${strategyName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading && stats.totalSignals === 0) return (
        <div className="flex items-center gap-2 bg-violet-950/20 border border-violet-800/40 rounded-xl p-3 shadow-sm">
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            <span className="text-xs text-gray-400">Running server backtest...</span>
        </div>
    );

    if (!isLoading && stats.totalSignals === 0) return (
        <div className="text-xs text-gray-500 italic">Insufficient signals found</div>
    );

    return (
        <div className="flex items-center gap-4 bg-violet-950/20 border border-violet-800/40 rounded-xl p-3 pr-4 shadow-sm backdrop-blur-sm">
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-gray-800" />
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
                        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                        className={cn("transition-all duration-1000 ease-out", colorClass)} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-sm font-bold", colorClass)}>%{displayRate.toFixed(0)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">Strategy Backtest</span>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-300 font-medium bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                        {stats.totalSignals} Signal
                    </span>
                    <span className="text-[11px] text-gray-400">{stats.wins} Hit</span>
                    {stats.profitFactor !== undefined && stats.profitFactor > 0 && (() => {
                        const pf = stats.profitFactor;
                        let pfColor = "bg-red-500/10 text-red-400 border-red-500/20";
                        if (pf >= 1.5) pfColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                        else if (pf >= 1.0) pfColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                        
                        const rrRatio = stats.avgWin && stats.avgLoss && stats.avgLoss !== 0
                            ? (stats.avgWin / stats.avgLoss).toFixed(1)
                            : "1.0";
                        
                        const returnStr = stats.totalReturn !== undefined
                            ? `${stats.totalReturn > 0 ? '+' : ''}${(stats.totalReturn * 100).toFixed(1)}%`
                            : 'N/A';

                        const titleText = `Total Return: ${returnStr} | R/R: 1:${rrRatio}`;

                        return (
                            <span 
                                className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border select-none cursor-help", pfColor)}
                                title={titleText}
                            >
                                PF: {pf.toFixed(2)}
                            </span>
                        );
                    })()}
                    {stats.avgBarsHeld && (
                        <span className="text-[10px] text-gray-500">~{stats.avgBarsHeld.toFixed(1)} bars avg</span>
                    )}
                </div>

                {optimizedParams && (
                    <div className="flex items-center gap-1.5 mt-1">
                        <Popover>
                            <PopoverTrigger asChild>
                                <button className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer select-none">
                                    <Zap className="w-3 h-3 text-amber-400 flex-shrink-0 animate-pulse" />
                                    <span>Optimized Settings</span>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 bg-gray-950 border-gray-800 text-gray-250 p-2.5 shadow-2xl z-50 backdrop-blur-md">
                                <div className="font-bold text-[10px] text-amber-300 border-b border-gray-850 pb-1.5 mb-1.5 uppercase tracking-wider flex items-center justify-between gap-2">
                                    <span>Parameter Values</span>
                                    <span className="text-[8px] text-gray-500 font-normal normal-case">Scroll to view</span>
                                </div>
                                <div className="flex flex-col gap-1 font-mono text-[10px] max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-violet-800/60 scrollbar-track-transparent">
                                    {Object.entries(optimizedParams).map(([key, val]) => (
                                        <div key={key} className="flex justify-between gap-4 py-0.5 border-b border-gray-900/30 last:border-b-0">
                                            <span className="text-gray-400 uppercase">{key}:</span>
                                            <span className="text-amber-400 font-bold">{val}</span>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </div>

            {/* Dikey Hizalanmış Aksiyon Butonları */}
            <div className="flex flex-col items-center justify-center gap-2 border-l border-violet-800/35 pl-3 self-stretch flex-shrink-0">
                {/* 1. Market Filter Toggle */}
                <div className="flex flex-col items-center justify-center gap-1 mb-1">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={applyMarketFilter}
                        onClick={() => setApplyMarketFilter(!applyMarketFilter)}
                        className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                            applyMarketFilter ? "bg-emerald-500" : "bg-gray-700"
                        )}
                        title="Blocks new BUY signals when SPY is below its 200-SMA"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                applyMarketFilter ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </button>
                    <span className="text-[8px] text-gray-500 tracking-tight uppercase select-none">Market Filter</span>
                </div>

                {/* 2. Optimize (Şimşek) */}
                <button
                    onClick={isAIDiscovered ? undefined : handleOptimize}
                    disabled={isOptimizing || isAIDiscovered}
                    className={cn(
                        "p-1 rounded transition-colors",
                        isAIDiscovered
                            ? "text-gray-600 cursor-not-allowed"
                            : "hover:bg-violet-900/40 text-violet-400 hover:text-violet-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    title={isAIDiscovered
                        ? "Already optimized by Deep Discovery engine"
                        : "Optimize Strategy Parameters"
                    }
                >
                    {isOptimizing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Zap className="w-3.5 h-3.5" />
                    )}
                </button>

                {/* 2. Reset (Geri Al) */}
                <button
                    onClick={handleResetParams}
                    disabled={!optimizedParams}
                    className={cn(
                        "p-1 hover:bg-violet-900/40 rounded transition-colors text-violet-400 hover:text-violet-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    )}
                    title="Reset to Defaults"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {/* 3. Trade History (Geçmiş) */}
                <Dialog>
                    <DialogTrigger asChild>
                        <button className="p-1 hover:bg-violet-900/40 rounded transition-colors text-violet-400 hover:text-violet-200" title="Trade History">
                            <History className="w-3.5 h-3.5" />
                        </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[800px] bg-gray-950 border-gray-800 text-gray-100">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle className="flex items-center gap-2 text-violet-300">
                                    <History className="w-5 h-5" />
                                    Trade History (Path-Aware Engine)
                                </DialogTitle>
                                <button
                                    onClick={handleDownloadCSV}
                                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-violet-400 hover:text-violet-200 border border-violet-850/40 hover:bg-violet-900/20 px-2 py-1 rounded transition-colors mr-6 select-none"
                                    title="Export to CSV"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Export CSV</span>
                                </button>
                            </div>
                        </DialogHeader>
                        <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead className="sticky top-0 bg-gray-950 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                                    <tr>
                                        <th className="py-2 px-2">Date</th>
                                        <th className="py-2 px-2">Signal</th>
                                        <th className="py-2 px-2 text-right">Entry</th>
                                        <th className="py-2 px-2 text-right">Exit</th>
                                        <th className="py-2 px-2 text-center">Bars</th>
                                        <th className="py-2 px-2 text-center">Exit Reason</th>
                                        <th className="py-2 px-2 text-center">Result</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-900">
                                    {[...stats.history].reverse().map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-900/40 transition-colors">
                                            <td className="py-2 px-2 text-gray-400">
                                                {typeof item.time === 'number'
                                                    ? new Date(item.time * 1000).toLocaleDateString()
                                                    : item.time}
                                            </td>
                                            <td className="py-2 px-2">
                                                <span className={cn(
                                                    "flex items-center gap-1 font-bold",
                                                    item.signal === "BUY" ? "text-emerald-400" : "text-red-400"
                                                )}>
                                                    {item.signal === "BUY" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {item.signal}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium">{item.price.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right text-gray-400">{item.futurePrice.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-center text-gray-400">{item.barsHeld ?? '—'}</td>
                                            <td className="py-2 px-2 text-center">
                                                <span className={cn(
                                                    "text-[10px] px-1 py-0.5 rounded",
                                                    item.exitReason === 'take_profit' ? "bg-emerald-900/30 text-emerald-400" :
                                                    item.exitReason === 'stop_loss' ? "bg-red-900/30 text-red-400" :
                                                    item.exitReason === 'trailing_stop' ? "bg-blue-900/30 text-blue-400" :
                                                    item.exitReason === 'time_stop' ? "bg-yellow-900/30 text-yellow-400" :
                                                    "bg-gray-800 text-gray-500"
                                                )}>
                                                    {item.exitReason ? item.exitReason.replace(/_/g, ' ') : 'lookforward'}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                                {item.isWin ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        <CheckCircle2 className="w-3 h-3" /> HIT
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        <XCircle className="w-3 h-3" /> MISS
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}