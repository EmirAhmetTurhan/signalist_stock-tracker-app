"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { calculateWinRate, Candle, BacktestHistoryItem } from "@/lib/backtest-utils";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, History, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { findBestParameter, OPTIMIZABLE_INDICATORS } from "@/lib/optimizer-utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type IndicatorData = any;

interface BacktestMonitorProps {
    indicatorName: string;
    candles: Candle[];
    data: IndicatorData;
    config?: {
        lookForward: number; // Kaç gün sonrasını test ediyoruz?
    };
}

export default function BacktestMonitor({
    indicatorName,
    candles,
    data,
    config = { lookForward: 5 },
}: BacktestMonitorProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [stats, setStats] = useState<{
        winRate: number;
        totalSignals: number;
        wins: number;
        history: BacktestHistoryItem[];
    }>({ winRate: 0, totalSignals: 0, wins: 0, history: [] });
    const [animatedPercent, setAnimatedPercent] = useState(0);
    const [isOptimizing, setIsOptimizing] = useState(false);

    useEffect(() => {
        const result = calculateWinRate(indicatorName, candles, data, config);
        setStats(result);

        const timer = setTimeout(() => {
            setAnimatedPercent(result.winRate);
        }, 300);

        return () => clearTimeout(timer);
    }, [indicatorName, candles, data, config]);

    const handleRegenerate = () => {
        setIsOptimizing(true);
        setTimeout(() => {
            const result = findBestParameter(indicatorName, candles, config);
            if (result && result.bestVal !== -1) {
                const params = new URLSearchParams(searchParams.toString());
                const paramName = OPTIMIZABLE_INDICATORS[indicatorName]?.param;
                if (paramName) {
                    params.set(paramName, result.bestVal.toString());
                    router.push(`${window.location.pathname}?${params.toString()}`);
                }
            }
            setIsOptimizing(false);
        }, 50);
    };

    // Görsel (UI) Kısımları
    const size = 56;
    const strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (animatedPercent / 100) * circumference;

    let colorClass = "text-gray-500";
    if (animatedPercent >= 55) colorClass = "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    else if (animatedPercent >= 45) colorClass = "text-yellow-500";
    else if (animatedPercent > 0) colorClass = "text-red-500";

    if (stats.totalSignals === 0) return null;

    return (
        <div className="flex items-center gap-3 bg-gray-900/40 border border-gray-800 rounded-lg p-2 pr-4 shadow-sm backdrop-blur-sm ml-auto">
            {OPTIMIZABLE_INDICATORS[indicatorName] && (
                <button
                    onClick={handleRegenerate}
                    disabled={isOptimizing}
                    className="p-1.5 hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-gray-200 disabled:opacity-50 group"
                    title="Optimize parameters"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", isOptimizing && "animate-spin")} />
                </button>
            )}

            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-gray-800" />
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={cn("transition-all duration-1000 ease-out", colorClass)} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-sm font-bold", colorClass)}>%{animatedPercent.toFixed(0)}</span>
                </div>
            </div>

            <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Backtesting</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-300 font-medium bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
                        {stats.totalSignals} Days
                    </span>
                    <span className="text-[10px] text-gray-400">
                        {stats.wins} Hit
                    </span>

                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-gray-300 ml-1" title="İşlem Geçmişi">
                                <History className="w-3 h-3" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800 text-gray-100">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-gray-200">
                                    <History className="w-5 h-5" />
                                    {indicatorName} İşlem Geçmişi
                                </DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="sticky top-0 bg-gray-950 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                                        <tr>
                                            <th className="py-2 px-3">Tarih</th>
                                            <th className="py-2 px-3">Sinyal</th>
                                            <th className="py-2 px-3 text-right">Fiyat</th>
                                            <th className="py-2 px-3 text-right">Hedef ({config.lookForward}G)</th>
                                            <th className="py-2 px-3 text-center">Sonuç</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-900">
                                        {[...stats.history].reverse().map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-900/40 transition-colors">
                                                <td className="py-2 px-3 text-gray-400">
                                                    {typeof item.time === 'number'
                                                        ? new Date(item.time * 1000).toLocaleDateString()
                                                        : item.time}
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={cn(
                                                        "flex items-center gap-1 font-bold",
                                                        item.signal === "BUY" ? "text-emerald-400" : "text-red-400"
                                                    )}>
                                                        {item.signal === "BUY" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {item.signal}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-right font-medium">{item.price.toFixed(2)}</td>
                                                <td className="py-2 px-3 text-right text-gray-400">{item.futurePrice.toFixed(2)}</td>
                                                <td className="py-2 px-3 text-center">
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
        </div>
    );
}