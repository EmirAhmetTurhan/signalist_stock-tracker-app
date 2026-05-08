"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StrategyBacktestMonitor, { AllIndicatorData } from "@/components/StrategyBacktestMonitor";
import { loadCustomStrategies, AVAILABLE_INDICATORS } from "@/components/CustomStrategyModal";
import type { CustomStrategy } from "@/components/CustomStrategyModal";

type Candle = { time: string | number; close: number; high: number; low: number };

interface CustomStrategyPanelProps {
    candles: Candle[];
    allData: AllIndicatorData;
}

// Anlık sinyal hesapla (son bar)
function getLastSignal(key: string, data: AllIndicatorData, candles?: Candle[]): "BUY" | "SELL" | "—" {
    const last = (arr: { value: number }[]) => arr?.[arr.length - 1]?.value;
    switch (key) {
        case "rsi": {
            const r = last(data.rsiData?.rsi ?? []);
            const m = last(data.rsiData?.ma ?? []);
            if (r === undefined || m === undefined) return "—";
            return r > m ? "BUY" : "SELL";
        }
        case "cci": {
            const c = last(data.cciData?.cci ?? []);
            if (c === undefined) return "—";
            return c > 0 ? "BUY" : "SELL";
        }
        case "wavetrend": {
            const w1 = last(data.waveTrendData?.wt1 ?? []);
            const w2 = last(data.waveTrendData?.wt2 ?? []);
            if (w1 === undefined || w2 === undefined) return "—";
            return w1 > w2 ? "BUY" : "SELL";
        }
        case "macd": {
            const m = last(data.macdData?.macd ?? []);
            const s = last(data.macdData?.signal ?? []);
            if (m === undefined || s === undefined) return "—";
            return m > s ? "BUY" : "SELL";
        }
        case "stochrsi": {
            const k = last(data.stochRsiData?.k ?? []);
            const d = last(data.stochRsiData?.d ?? []);
            if (k === undefined || d === undefined) return "—";
            return k > d ? "BUY" : "SELL";
        }
        case "dmi": {
            const plus = last(data.dmiData?.plusDI ?? []);
            const minus = last(data.dmiData?.minusDI ?? []);
            if (plus === undefined || minus === undefined) return "—";
            return plus > minus ? "BUY" : "SELL";
        }
        case "smi": {
            const s = last(data.smiData?.smi ?? []);
            const g = last(data.smiData?.signal ?? []);
            if (s === undefined || g === undefined) return "—";
            return s > g ? "BUY" : "SELL";
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[arr.length - 1]?.value;
            const prev = arr[arr.length - 2]?.value;
            if (cur === undefined || prev === undefined) return "—";
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return "—";
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[arr.length - 1]?.value;
            const prev = arr[arr.length - 2]?.value;
            if (cur === undefined || prev === undefined) return "—";
            if (cur < 20) return "BUY";
            if (cur > 80) return "SELL";
            return cur > prev ? "BUY" : "SELL";
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[arr.length - 1]?.value;
            const prev = arr[arr.length - 2]?.value;
            if (cur === undefined || prev === undefined) return "—";
            if (cur < -80) return "BUY";
            if (cur > -20) return "SELL";
            return cur > prev ? "BUY" : "SELL";
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[arr.length - 1]?.value;
            const prev = arr[arr.length - 2]?.value;
            if (cur === undefined || prev === undefined) return "—";
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return "—";
        }
        case "cmf": {
            const cur = last(data.cmfData ?? []);
            if (cur === undefined) return "—";
            if (cur > 0.05) return "BUY";
            if (cur < -0.05) return "SELL";
            return "—";
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[arr.length - 1]?.value;
            if (cur === undefined || arr.length < 2) return "—";
            const slice = arr.slice(Math.max(0, arr.length - 21)).map(p => p.value);
            const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
            return cur > sma ? "BUY" : "SELL";
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[arr.length - 1]?.value;
            const prev = arr[arr.length - 2]?.value;
            if (cur === undefined || prev === undefined) return "—";
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return "—";
        }
        case "madr": {
            const cur = last(data.madrData ?? []);
            if (cur === undefined) return "—";
            return cur > 0 ? "BUY" : "SELL";
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[arr.length - 1]?.value;
            const prevA = arr[arr.length - 2]?.value;
            const curC = candles?.[candles.length - 1]?.close;
            const prevC = candles?.[candles.length - 2]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return "—";
            if (prevC < prevA && curC > curA) return "BUY";
            if (prevC > prevA && curC < curA) return "SELL";
            return "—";
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[arr.length - 1];
            const prevBB = arr[arr.length - 2];
            const curC = candles?.[candles.length - 1]?.close;
            const prevC = candles?.[candles.length - 2]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return "—";
            if (prevC < prevBB.lower && curC > curBB.lower) return "BUY";
            if (prevC > prevBB.upper && curC < curBB.upper) return "SELL";
            return "—";
        }
        default: return "—";
    }
}

export default function CustomStrategyPanel({ candles, allData }: CustomStrategyPanelProps) {
    const searchParams = useSearchParams();
    const strategyParam = searchParams.get("strategy") || "";

    const [strategy, setStrategy] = useState<CustomStrategy | null>(null);

    useEffect(() => {
        if (!strategyParam.startsWith("custom_")) { setStrategy(null); return; }
        const all = loadCustomStrategies();
        setStrategy(all.find(s => s.key === strategyParam) ?? null);
    }, [strategyParam]);

    if (!strategy || !strategyParam.startsWith("custom_")) return null;

    const indicators = strategy.indicators;
    const signals = indicators.map(k => getLastSignal(k, allData, candles));
    const validSignals = signals.filter(s => s !== "—");
    const allBuy = validSignals.length > 0 && validSignals.every(s => s === "BUY");
    const allSell = validSignals.length > 0 && validSignals.every(s => s === "SELL");

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
                        Özel Strateji — {indicators.length} indikatör, tümü aynı yönde
                    </span>
                </div>
                <StrategyBacktestMonitor
                    strategyName="CUSTOM"
                    candles={candles}
                    customIndicators={indicators}
                    allData={allData}
                />
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
                                    {isBuy ? "▲ AL" : "▼ SAT"}
                                </span>
                            }
                        </div>
                    );
                })}

                {/* Strateji Kararı */}
                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Strateji Kararı</div>
                    {allBuy
                        ? <span className="font-bold text-sm text-emerald-300">✓ AL</span>
                        : allSell
                            ? <span className="font-bold text-sm text-red-300">✗ SAT</span>
                            : <span className="font-semibold text-sm text-yellow-400">⚡ ÇELİŞKİ</span>
                    }
                </div>
            </div>
        </div>
    );
}
