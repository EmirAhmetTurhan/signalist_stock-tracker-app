"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import StrategyBacktestMonitor, { AllIndicatorData } from "@/components/panels/StrategyBacktestMonitor";
import { loadCustomStrategies, saveCustomStrategies, AVAILABLE_INDICATORS } from "@/components/panels/CustomStrategyModal";
import type { CustomStrategy } from "@/components/panels/CustomStrategyModal";
import StrategyDiscoveryDialog from "@/components/panels/StrategyDiscoveryDialog";
import { getSavedStrategyById, getSavedStrategies } from "@/lib/actions/saved-strategy.actions";
import type { Timeframe, StrategyMode } from "@/lib/ta/types";
import ForwardTestCreator from "@/components/portfolio/ForwardTestCreator";
import { getLastSignal } from '@/lib/ta/last-signal';
import type { AllIndicatorData as SharedAllData } from '@/lib/ta/last-signal';

type Candle = { time: string | number; close: number; high: number; low: number };

interface CustomStrategyPanelProps {
    candles: Candle[];
    allData: AllIndicatorData;
    symbol: string;
    interval: Timeframe;
    userId: string;
}

export default function CustomStrategyPanel({ candles, allData, symbol, interval, userId }: CustomStrategyPanelProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const strategyParam = searchParams.get("strategy") || "";

    const [strategy, setStrategy] = useState<CustomStrategy | null>(null);

    useEffect(() => {
        if (strategyParam.startsWith("custom_")) {
            // Load from localStorage
            const all = loadCustomStrategies();
            setStrategy(all.find(s => s.key === strategyParam) ?? null);
        } else if (strategyParam.startsWith("saved_") && userId) {
            // Load from MongoDB
            const mongoId = strategyParam.replace("saved_", "");
            getSavedStrategyById(userId, mongoId).then(res => {
                if (res.success && res.data) {
                    const d = res.data;
                    setStrategy({
                        key: `saved_${d.id}`,
                        name: d.name,
                        indicators: d.indicators,
                        createdAt: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
                        mode: d.mode,
                        lookForward: d.lookForward,
                        params: d.discoveredParams ?? undefined,
                        discoveryWinRate: d.discoveredWinRate ?? undefined,
                        discoverySignalCount: d.discoveredTotalSignals ?? undefined,
                    });
                } else {
                    setStrategy(null);
                }
            }).catch(() => setStrategy(null));
        } else {
            setStrategy(null);
        }
    }, [strategyParam, userId]);

    if (!strategy || !strategyParam.startsWith("custom_") && !strategyParam.startsWith("saved_")) return null;

    const indicators = strategy.indicators;
    const signals = indicators.map(k => getLastSignal(k, allData, candles));
    const validSignals = signals.filter(s => s !== "—");
    const mode: StrategyMode = strategy.mode ?? 'all';
    const total = validSignals.length;
    const buyCount = validSignals.filter(s => s === "BUY").length;
    const sellCount = validSignals.filter(s => s === "SELL").length;

    // Decision string: "BUY" | "SELL" | "CONFLICT"
    let decision: "BUY" | "SELL" | "CONFLICT";
    if (mode === 'majority') {
        if (buyCount > total / 2) decision = "BUY";
        else if (sellCount > total / 2) decision = "SELL";
        else decision = "CONFLICT";
    } else {
        if (buyCount === total) decision = "BUY";
        else if (sellCount === total) decision = "SELL";
        else decision = "CONFLICT";
    }

    // Grid sütun sayısı: indikatörler + karar sütunu
    const cols = indicators.length + 1;

    return (
        <div className="p-4 border border-emerald-800/40 rounded-xl bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.06)]">
            {/* Başlık + Backtest */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="text-base font-semibold text-emerald-200">{strategy.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                        {strategyParam.startsWith("saved_") ? 'Saved' : 'Custom'} Strategy — {indicators.length} indicators, {mode === 'majority' ? 'majority (>50%)' : 'all must agree'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <StrategyDiscoveryDialog
                        candles={candles}
                        allData={allData}
                        symbol={symbol}
                        interval={interval}
                        mode={mode}
                        userId={userId}
                        onApply={(discovered) => {
                            // Save discovered strategy with ALL params to localStorage and navigate
                            const newStrategy: CustomStrategy = {
                                key: `custom_${Date.now()}`,
                                name: `Discovered — ${discovered.indicators.map(k =>
                                    AVAILABLE_INDICATORS.find(i => i.key === k)?.label ?? k.toUpperCase()
                                ).join(' + ')}`,
                                indicators: discovered.indicators,
                                createdAt: Date.now(),
                                mode: mode,
                                lookForward: Math.round(discovered.params.lookForward ?? 14),
                                params: { ...discovered.params },
                                discoveryWinRate: discovered.winRate,
                                discoverySignalCount: discovered.totalSignals ?? 0,
                            };
                            const existing = loadCustomStrategies();
                            saveCustomStrategies([newStrategy, ...existing]);
                            const params = new URLSearchParams(searchParams.toString());
                            params.set('strategy', newStrategy.key);
                            router.push(`${pathname}?${params.toString()}`);
                        }}
                    />
                    <StrategyBacktestMonitor
                        strategyName="CUSTOM"
                        candles={candles}
                        customIndicators={indicators}
                        allData={allData}
                        mode={mode}
                        interval={interval}
                        config={{ lookForward: strategy.lookForward ?? 14 }}
                        initialOptimizedParams={strategy.params}
                        discoveryWinRate={strategy.discoveryWinRate}
                        discoverySignalCount={strategy.discoverySignalCount}
                        signalProfile="TrendFollower"
                    />
                </div>
            </div>

            {/* Sinyal kartları */}
            <div
                className="grid gap-2 text-xs text-gray-400"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {/* Her indikatör için sinyal kutusu */}
                {indicators.map((key, idx) => {
                    const meta = AVAILABLE_INDICATORS.find(i => i.key === key);
                    const sig = signals[idx];
                    const isBuy = sig === "BUY";
                    return (
                        <div key={key} className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                                {meta?.label ?? key} Sinyali
                            </div>
                            {sig === "—"
                                ? <span className="text-gray-600">—</span>
                                : <span className={`font-semibold text-sm ${isBuy ? "text-emerald-400" : "text-red-400"}`}>
                                    {isBuy ? "▲ BUY" : "▼ SELL"}
                                </span>
                            }
                        </div>
                    );
                })}

                {/* Strategy Decision */}
                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Strategy Decision</div>
                    {decision === "BUY"
                        ? <span className="font-bold text-sm text-emerald-300">✓ BUY {mode === 'majority' && `(${buyCount}/${total})`}</span>
                        : decision === "SELL"
                            ? <span className="font-bold text-sm text-red-300">✗ SELL {mode === 'majority' && `(${sellCount}/${total})`}</span>
                            : <span className="font-semibold text-sm text-yellow-400">⚡ CONFLICT {mode === 'majority' && `(${Math.max(buyCount, sellCount)}/${total})`}</span>
                    }
                </div>
            </div>

            {symbol && (
                <div className="mt-4 pt-4 border-t border-gray-800/50">
                    <ForwardTestCreator
                        symbol={symbol}
                        interval={interval}
                        strategyName={strategy.name}
                        indicators={indicators}
                        userId={userId}
                    />
                </div>
            )}
        </div>
    );
}
