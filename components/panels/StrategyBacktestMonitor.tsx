"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AVAILABLE_INDICATORS } from "@/components/panels/CustomStrategyModal";
import type { StrategyMode, Timeframe } from "@/lib/ta/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { History, CheckCircle2, XCircle, TrendingUp, TrendingDown, Loader2, Zap, RotateCcw, BarChart3 } from "lucide-react";
import { optimizeStrategyAction } from "@/lib/actions/optimize-strategy.actions";
import { runBacktestAction } from "@/lib/actions/backtest.actions";

type Candle = { time: string | number; close: number; high: number; low: number };
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

export interface AllIndicatorData {
    rsiData?: { rsi: Series; ma: Series };
    cciData?: { cci: Series; ma: Series };
    waveTrendData?: { wt1: Series; wt2: Series; crosses?: { time: string | number; cross: 1 | -1 }[] };
    macdData?: { macd: Series; signal: Series; histogram: (Series[number] & { color?: string })[] };
    stochRsiData?: { k: Series; d: Series };
    dmiData?: { plusDI: Series; minusDI: Series; adx: Series };
    smiData?: { smi: Series; signal: Series; histogram?: (Series[number] & { color?: string })[] };
    aoData?: Series;
    mfiData?: { mfi: Series };
    wprData?: Series;
    diData?: Series;
    cmfData?: Series;
    adData?: Series;
    nvData?: Series;
    madrData?: Series;
    almaData?: Series;
    bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
}

interface StrategyBacktestMonitorProps {
    strategyName: string;
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
    /** Signal profile for backtest sensitivity. Defaults to 'TrendFollower'
     *  to match Phase 4.5 full-fidelity backtest in discovery-deep-search. */
    signalProfile?: 'TrendFollower' | 'SwingTrader' | 'Aggressive' | 'Balanced' | 'Conservative';
}

export default function StrategyBacktestMonitor({
    strategyName,
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
    signalProfile = 'TrendFollower',
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
    }>({
        winRate: 0,
        totalSignals: 0,
        wins: 0,
        history: [],
    });
    const [animatedPercent, setAnimatedPercent] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [optimizedParams, setOptimizedParams] = useState<Record<string, number> | null>(initialOptimizedParams ?? null);
    const [optimizedWinRate, setOptimizedWinRate] = useState<number>(0);

    const isCustom = strategyName === "CUSTOM" && customIndicators && allData;
    const isAIDiscovered = !!(discoveryWinRate && discoveryWinRate > 0);

    const handleOptimize = useCallback(async () => {
        if (!candles || candles.length === 0) return;
        if (!isCustom && strategyName !== "RSI_CCI_WT") return;

        setIsOptimizing(true);
        try {
            const indicators = isCustom && customIndicators
                ? customIndicators
                : ['rsi', 'cci', 'wavetrend'];

            const sourceData = isCustom && allData
                ? allData
                : { rsiData, cciData, waveTrendData };
            const dataForOpt = sanitizeAllData(sourceData, indicators);

            const result = await optimizeStrategyAction(
                candles,
                dataForOpt,
                indicators,
                { interval, mode }
            );

            if (result.iterations > 0) {
                setOptimizedParams(result.bestParams);
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
    }, [candles, isCustom, customIndicators, rsiData, cciData, waveTrendData, interval, mode]);

    function sanitizeAllData(data: AllIndicatorData, indicators: string[]): any {
        const result: any = {};
        for (const key of indicators) {
            switch (key) {
                case 'rsi': if (data.rsiData) result.rsiData = data.rsiData; break;
                case 'cci': if (data.cciData) result.cciData = data.cciData; break;
                case 'wavetrend': if (data.waveTrendData) result.waveTrendData = data.waveTrendData; break;
                case 'macd': if (data.macdData) result.macdData = data.macdData; break;
                case 'stochrsi': if (data.stochRsiData) result.stochRsiData = data.stochRsiData; break;
                case 'dmi': if (data.dmiData) result.dmiData = data.dmiData; break;
                case 'smi': if (data.smiData) result.smiData = data.smiData; break;
                case 'ao': if (data.aoData) result.aoData = data.aoData; break;
                case 'mfi': if (data.mfiData) result.mfiData = data.mfiData; break;
                case 'wpr': if (data.wprData) result.wprData = data.wprData; break;
                case 'di': if (data.diData) result.diData = data.diData; break;
                case 'cmf': if (data.cmfData) result.cmfData = data.cmfData; break;
                case 'ad': if (data.adData) result.adData = data.adData; break;
                case 'netvol': if (data.nvData) result.nvData = data.nvData; break;
                case 'madr': if (data.madrData) result.madrData = data.madrData; break;
                case 'alma': if (data.almaData) result.almaData = data.almaData; break;
                case 'bb': if (data.bbData) result.bbData = data.bbData; break;
            }
        }
        return JSON.parse(JSON.stringify(result));
    }

    const handleResetParams = useCallback(() => {
        if (initialOptimizedParams) {
            setOptimizedParams(initialOptimizedParams);
            setOptimizedWinRate(0);
        } else {
            setOptimizedParams(null);
            setOptimizedWinRate(0);
        }
        // Always animate back to the live backtest result
        setAnimatedPercent(stats.winRate);
    }, [initialOptimizedParams, stats.winRate]);

    // ── Memoize customIndicators to prevent infinite useEffect re-runs
    const customIndicatorsKey = useMemo(
        () => (customIndicators ? JSON.stringify([...customIndicators].sort()) : ''),
        [customIndicators],
    );

    // ── Server-side backtest using DST fusion + path-aware engine ──
    useEffect(() => {
        if (!candles || candles.length === 0) return;

        let cancelled = false;
        setIsLoading(true);

        async function runBacktest() {
            try {
                const builtInData = allData ?? { rsiData, cciData, waveTrendData };

                const result = await runBacktestAction(
                    candles,
                    strategyName,
                    builtInData as any,
                    {
                        lookForward: config.lookForward,
                        interval,
                        customIndicators: customIndicators,
                        mode,
                        signalProfile,
                        evaluationMode: 'pathaware',
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
                });

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
                if (!cancelled) setIsLoading(false);
            }
        }

        runBacktest();

        return () => { cancelled = true; };
    }, [strategyName, candles, config.lookForward, interval, mode, customIndicatorsKey]);

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
        <div className="flex items-center gap-4 bg-violet-950/20 border border-violet-800/40 rounded-xl p-3 pr-5 shadow-sm backdrop-blur-sm">
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
                    {stats.avgBarsHeld && (
                        <span className="text-[10px] text-gray-500">~{stats.avgBarsHeld.toFixed(1)} bars avg</span>
                    )}

                    <button
                        onClick={isAIDiscovered ? undefined : handleOptimize}
                        disabled={isOptimizing || isAIDiscovered}
                        className={cn(
                            "ml-auto p-1 rounded transition-colors",
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

                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="ml-auto p-1 hover:bg-violet-900/40 rounded transition-colors text-violet-400 hover:text-violet-200" title="Trade History">
                                <History className="w-3.5 h-3.5" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[800px] bg-gray-950 border-gray-800 text-gray-100">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-violet-300">
                                    <History className="w-5 h-5" />
                                    Trade History (Path-Aware Engine)
                                </DialogTitle>
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

                {optimizedParams && (
                    <div className="flex flex-wrap items-center gap-1 mt-1 bg-violet-900/20 border border-violet-800/30 rounded px-2 py-1">
                        <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[9px] text-amber-300 font-semibold uppercase tracking-wider mr-1">Optimized</span>
                        {Object.entries(optimizedParams).map(([key, val]) => (
                            <span key={key} className="text-[9px] bg-amber-900/40 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded-full">
                                {key}:{val}
                            </span>
                        ))}
                        <span className="text-[9px] bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 px-1.5 py-0.5 rounded-full font-bold ml-1">
                            {optimizedWinRate.toFixed(1)}%
                        </span>
                        <button
                            onClick={handleResetParams}
                            className="ml-auto p-0.5 hover:bg-violet-800/40 rounded transition-colors text-gray-400 hover:text-gray-200"
                            title="Reset to Defaults"
                        >
                            <RotateCcw className="w-3 h-3" />
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap gap-1 mt-1">
                    {displayInds.map(label => (
                        <span key={label} className="text-[9px] bg-violet-900/40 text-violet-300 border border-violet-700/50 px-1.5 py-0.5 rounded-full">
                            {label}
                        </span>
                    ))}
                    <span className="text-[9px] bg-violet-900/40 text-violet-300 border border-violet-700/50 px-1.5 py-0.5 rounded-full">
                        {config.lookForward}G
                    </span>
                </div>
            </div>
        </div>
    );
}