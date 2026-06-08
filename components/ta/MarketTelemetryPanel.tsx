"use client";

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import type { MarketRegime } from "@/lib/ta/types";

interface TelemetryData {
    symbol: string;
    interval: string;
    analysisPeriod: string;
    regimeMap: {
        uptrends: { type: string; startDate: string; endDate: string; durationBars: number; priceChange: number; priceChangePct: number }[];
        downtrends: { type: string; startDate: string; endDate: string; durationBars: number; priceChange: number; priceChangePct: number }[];
        rangingZones: { type: string; startDate: string; endDate: string; durationBars: number; priceChange: number; priceChangePct: number }[];
        volatileBreakouts: { type: string; startDate: string; endDate: string; durationBars: number; priceChange: number; priceChangePct: number }[];
    };
    indicatorPerformanceByRegime: Record<MarketRegime, Record<string, { hitRate: number; ci95: [number, number]; sampleSize: number; sufficientSample: boolean }>>;
    optimalStrategies: { regime: MarketRegime; indicators: string[]; accuracy: number; signalFrequency: string; sampleSize: number; sufficientSample: boolean }[];
    priceSummary: { type: string; startDate: string; endDate: string; durationBars: number; priceChange: number; priceChangePct: number }[];
    totalCandles: number;
    analysisDate: string;
}

interface MarketTelemetryPanelProps {
    symbol: string;
    interval?: string;
    years?: number;
}

const REGIME_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    uptrend: { label: "Uptrend", emoji: "📈", color: "text-green-400" },
    uptrends: { label: "Uptrends", emoji: "📈", color: "text-green-400" },
    downtrend: { label: "Downtrend", emoji: "📉", color: "text-red-400" },
    downtrends: { label: "Downtrends", emoji: "📉", color: "text-red-400" },
    ranging: { label: "Ranging", emoji: "↔️", color: "text-yellow-400" },
    rangingZones: { label: "Ranging Zones", emoji: "↔️", color: "text-yellow-400" },
    volatile: { label: "Volatile", emoji: "⚡", color: "text-orange-400" },
    volatileBreakouts: { label: "Volatile Breakouts", emoji: "⚡", color: "text-orange-400" },
    neutral: { label: "Neutral", emoji: "➖", color: "text-gray-400" },
};

export default function MarketTelemetryPanel({ symbol, interval = "1d", years = 2 }: MarketTelemetryPanelProps) {
    const [data, setData] = useState<TelemetryData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetched, setFetched] = useState(false);

    // Reset data when symbol or interval changes to avoid stale UI
    useEffect(() => {
        setData(null);
        setError(null);
        setFetched(false);
    }, [symbol, interval]);

    // Auto-fetch on mount (panel opens → fetch immediately)
    useEffect(() => {
        if (!fetched && symbol) {
            fetchTelemetry();
        }
    }, [fetched, symbol]);

    async function fetchTelemetry() {
        if (!symbol) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/analysis/market-telemetry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: symbol.toUpperCase(), interval, years }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to load telemetry");
            }
            const result = await res.json();
            setData(result);
            setFetched(true);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="p-4 border border-violet-800/50 rounded-xl bg-violet-950/10 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                <span className="text-sm text-gray-400">Loading market telemetry for {symbol}...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-red-800/50 rounded-xl bg-red-950/10">
                <span className="text-sm text-red-400">Error: {error}</span>
            </div>
        );
    }

    if (!data) return null;

    const { regimeMap, optimalStrategies } = data;

    return (
        <div className="border border-violet-800/50 rounded-xl bg-violet-950/10 p-4 shadow-[0_0_20px_rgba(139,92,246,0.08)]">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-violet-200">
                        Market Telemetry — {symbol.toUpperCase()}
                    </span>
                </div>
                <span className="text-[10px] text-gray-500">
                    {data.totalCandles} bars · {interval}
                </span>
            </div>

            {/* Market Regime Summary */}
            <div className="grid grid-cols-4 gap-2 mb-3">
                {(["uptrends", "downtrends", "rangingZones", "volatileBreakouts"] as const).map(key => {
                    const items = regimeMap[key];
                    const info = REGIME_LABELS[key];
                    const totalChange = items.reduce((s, i) => s + (i.priceChangePct ?? i.priceChange ?? 0), 0);
                    return (
                        <div key={key} className="bg-gray-900/60 rounded-lg p-2 text-center border border-gray-800">
                            <div className="text-lg">{info.emoji}</div>
                            <div className={`text-[10px] ${info.color} font-medium`}>{info.label}</div>
                            <div className="text-xs font-bold text-gray-200">{items.length}</div>
                            <div className={`text-[10px] ${totalChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(1)}%
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Optimal Stratejiler */}
            <div className="mb-3">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Optimal Strategies</span>
                <div className="grid grid-cols-2 gap-1 mt-1">
                    {optimalStrategies
                        .filter(s => s.sufficientSample && s.indicators.length > 0)
                        .slice(0, 4)
                        .map((s, idx) => {
                            const info = REGIME_LABELS[s.regime] || { color: "text-gray-400" };
                            return (
                                <div key={idx} className="bg-gray-900/60 rounded p-1.5 border border-gray-800">
                                    <div className="flex items-center gap-1">
                                        <span className={`text-[9px] ${info.color} font-medium`}>
                                            {REGIME_LABELS[s.regime]?.label || s.regime}
                                        </span>
                                        <span className="text-[9px] text-emerald-400 font-bold">
                                            %{s.accuracy.toFixed(0)}
                                        </span>
                                    </div>
                                    <div className="text-[8px] text-gray-500 mt-0.5">
                                        {s.indicators.map(i => i.toUpperCase()).join(" + ")}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* Fiyat Hareketleri */}
            <details className="group">
                <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300">
                    📋 Price Movements ({data.priceSummary.length} periods)
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto">
                    <table className="w-full text-[9px]">
                        <thead className="text-gray-500 border-b border-gray-800">
                            <tr>
                                <th className="text-left py-1">Period</th>
                                <th className="text-right py-1">Duration</th>
                                <th className="text-right py-1">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.priceSummary.slice(0, 15).map((p, i) => (
                                <tr key={i} className="border-b border-gray-900">
                                    <td className="py-1 text-gray-400">
                                        <span className={REGIME_LABELS[p.type]?.color || "text-gray-400"}>
                                            {REGIME_LABELS[p.type]?.emoji || ""} {p.startDate} → {p.endDate}
                                        </span>
                                    </td>
                                    <td className="py-1 text-right text-gray-500">{p.durationBars} bar</td>
                                    <td className={`py-1 text-right font-medium ${p.priceChangePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                                        {p.priceChangePct >= 0 ? "+" : ""}{p.priceChangePct.toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}