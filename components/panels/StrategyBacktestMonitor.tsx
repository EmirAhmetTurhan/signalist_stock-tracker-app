"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { History, CheckCircle2, XCircle, TrendingUp, TrendingDown, Loader2, Zap, RotateCcw } from "lucide-react";
import { optimizeStrategyAction } from "@/lib/actions/optimize-strategy.actions";
import {
    rsiSignal, cciSignal, waveTrendSignal, macdSignal,
    stochRsiSignal, dmiSignal, smiSignal, aoSignal,
    mfiSignal, wprSignal, diSignal, cmfSignal, adSignal,
    netvolSignal, madrSignal, almaSignal, bbSignal,
    rsiCross, cciCross, waveTrendCross, macdCross,
    stochRsiCross, dmiCross, smiCross, aoCross,
    mfiCross, wprCross, diCross, cmfCross, adCross,
    netvolCross, madrCross, almaCross, bbCross,
} from '@/lib/ta/signal-registry';

type Candle = { time: string | number; close: number; high: number; low: number };
type Series = { time: string | number; value?: number }[];

export type HistoryItem = {
    time: string | number;
    signal: "BUY" | "SELL";
    price: number;
    futurePrice: number;
    isWin: boolean;
};

// ─── Tüm indikatör datasını tutan tip ────────────────────────────────────────
export interface AllIndicatorData {
    rsiData?: { rsi: Series; ma: Series };
    cciData?: { cci: Series; ma: Series };
    waveTrendData?: { wt1: Series; wt2: Series; crosses?: { time: string | number; cross: 1 | -1 }[] };
    macdData?: { macd: Series; signal: Series; histogram: (Series[number] & { color?: string })[] };
    stochRsiData?: { k: Series; d: Series };
    dmiData?: { plusDI: Series; minusDI: Series; adx: Series };
    smiData?: { smi: Series; signal: Series; histogram?: (Series[number] & { color?: string })[] };
    // Yeni indikatörler
    aoData?: Series;                        // Awesome Oscillator
    mfiData?: { mfi: Series };               // Money Flow Index
    wprData?: Series;                        // Williams %R
    diData?: Series;                        // Demand Index
    cmfData?: Series;                        // Chaikin Money Flow
    adData?: Series;                        // Accumulation/Distribution
    nvData?: Series;                        // Net Volume
    madrData?: Series;                        // MADR
    almaData?: Series;                        // ALMA
    bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[]; // Bollinger Bands
}

interface StrategyBacktestMonitorProps {
    // "RSI_CCI_WT" için built-in | "CUSTOM" için custom
    strategyName: string;
    candles: Candle[];
    // Built-in strateji datası (geriye dönük uyumluluk)
    rsiData?: AllIndicatorData["rsiData"];
    cciData?: AllIndicatorData["cciData"];
    waveTrendData?: AllIndicatorData["waveTrendData"];
    // Custom strateji için — seçili indikatör anahtarları + hepsinin datası
    customIndicators?: string[];
    allData?: AllIndicatorData;
    config?: { lookForward: number };
    mode?: StrategyMode;
    interval?: Timeframe;
    /** Pre-populated optimized params from a discovered/saved strategy (e.g., { rsi_len: 7, cci_len: 14 }) */
    initialOptimizedParams?: Record<string, number>;
    /** Win rate from the discovery result (displayed when initialOptimizedParams is provided) */
    discoveryWinRate?: number;
    /** Signal count from the discovery result */
    discoverySignalCount?: number;
}

// ─── Per-bar sinyal hesaplayıcı (her indikatör için BUY/SELL/null döner) ──────
function getIndicatorSignal(
    key: string,
    i: number,
    data: AllIndicatorData,
    candles?: Candle[]
): "BUY" | "SELL" | null {
    switch (key) {
        case "rsi": {
            if (!data.rsiData) return null;
            const rsi = data.rsiData.rsi[i]?.value;
            const rsiMa = data.rsiData.ma[i]?.value;
            if (rsi === undefined || rsiMa === undefined) return null;
            return rsiSignal(rsi, rsiMa);
        }
        case "cci": {
            if (!data.cciData) return null;
            const cci = data.cciData.cci[i]?.value;
            const ma = data.cciData.ma[i]?.value;
            if (cci === undefined || ma === undefined) return null;
            return cciSignal(cci, ma);
        }
        case "wavetrend": {
            if (!data.waveTrendData) return null;
            const wt1 = data.waveTrendData.wt1[i]?.value;
            const wt2 = data.waveTrendData.wt2[i]?.value;
            if (wt1 === undefined || wt2 === undefined) return null;
            return waveTrendSignal(wt1, wt2);
        }
        case "macd": {
            if (!data.macdData) return null;
            const macd = data.macdData.macd[i]?.value;
            const signal = data.macdData.signal[i]?.value;
            if (macd === undefined || signal === undefined) return null;
            return macdSignal(macd, signal);
        }
        case "stochrsi": {
            if (!data.stochRsiData) return null;
            const k = data.stochRsiData.k[i]?.value;
            const d = data.stochRsiData.d[i]?.value;
            if (k === undefined || d === undefined) return null;
            return stochRsiSignal(k, d);
        }
        case "dmi": {
            if (!data.dmiData) return null;
            const plus = data.dmiData.plusDI[i]?.value;
            const minus = data.dmiData.minusDI[i]?.value;
            const adx = data.dmiData.adx[i]?.value;
            if (plus === undefined || minus === undefined || adx === undefined) return null;
            return dmiSignal(plus, minus);
        }
        case "smi": {
            if (!data.smiData) return null;
            const smi = data.smiData.smi[i]?.value;
            const signal = data.smiData.signal[i]?.value;
            if (smi === undefined || signal === undefined) return null;
            return smiSignal(smi, signal);
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return aoSignal(cur, prev);
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return mfiSignal(cur, prev);
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return wprSignal(cur, prev);
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return diSignal(cur);
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return cmfSignal(cur);
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            const slice = arr.slice(Math.max(0, i - 20), i + 1).map(p => p.value).filter((v): v is number => v !== undefined);
            if (slice.length < 2) return null;
            const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
            return adSignal(cur, sma);
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return netvolSignal(cur);
        }
        case "madr": {
            const arr = data.madrData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return madrSignal(cur);
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[i]?.value;
            const prevA = arr[i - 1]?.value;
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return null;
            return almaSignal(curA, prevA, curC, prevC);
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[i];
            const prevBB = arr[i - 1];
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return null;
            if (curBB.lower === undefined || prevBB.lower === undefined || curBB.upper === undefined || prevBB.upper === undefined) return null;
            return bbSignal(curBB as import('@/lib/ta/signal-registry').BBPoint, prevBB as import('@/lib/ta/signal-registry').BBPoint, curC, prevC);
        }
        default:
            return null;
    }
}

// ─── Crossover kontrolü (delegated to signal-registry.ts) ──────────────────────
function hasFreshCrossover(key: string, i: number, data: AllIndicatorData, candles?: Candle[]): boolean {
    switch (key) {
        case "rsi": {
            if (!data.rsiData) return false;
            const rsi = data.rsiData.rsi[i]?.value; const rsiMa = data.rsiData.ma[i]?.value;
            const p1 = data.rsiData.rsi[i - 1]?.value; const p1Ma = data.rsiData.ma[i - 1]?.value;
            const p3 = data.rsiData.rsi[i - 3]?.value; const p3Ma = data.rsiData.ma[i - 3]?.value;
            if (rsi === undefined || rsiMa === undefined) return false;
            if (p1 !== undefined && p1Ma !== undefined && rsiCross(rsi, rsiMa, p1, p1Ma)) return true;
            if (p3 !== undefined && p3Ma !== undefined && rsiCross(rsi, rsiMa, p3, p3Ma)) return true;
            return false;
        }
        case "cci": {
            if (!data.cciData) return false;
            const cci = data.cciData.cci[i]?.value;
            const p1 = data.cciData.cci[i - 1]?.value;
            const p3 = data.cciData.cci[i - 3]?.value;
            if (cci === undefined) return false;
            if (p1 !== undefined && cciCross(cci, p1)) return true;
            if (p3 !== undefined && cciCross(cci, p3)) return true;
            return false;
        }
        case "wavetrend": {
            if (!data.waveTrendData) return false;
            const wt1 = data.waveTrendData.wt1[i]?.value; const wt2 = data.waveTrendData.wt2[i]?.value;
            const pw1 = data.waveTrendData.wt1[i - 1]?.value; const pw2 = data.waveTrendData.wt2[i - 1]?.value;
            const p3w1 = data.waveTrendData.wt1[i - 3]?.value; const p3w2 = data.waveTrendData.wt2[i - 3]?.value;
            if (wt1 === undefined || wt2 === undefined) return false;
            if (pw1 !== undefined && pw2 !== undefined && waveTrendCross(wt1, wt2, pw1, pw2)) return true;
            if (p3w1 !== undefined && p3w2 !== undefined && waveTrendCross(wt1, wt2, p3w1, p3w2)) return true;
            return false;
        }
        case "macd": {
            if (!data.macdData) return false;
            const macd = data.macdData.macd[i]?.value; const sig = data.macdData.signal[i]?.value;
            const pm = data.macdData.macd[i - 1]?.value; const ps = data.macdData.signal[i - 1]?.value;
            if (macd === undefined || sig === undefined || pm === undefined || ps === undefined) return false;
            return macdCross(macd, sig, pm, ps);
        }
        case "stochrsi": {
            if (!data.stochRsiData) return false;
            const k = data.stochRsiData.k[i]?.value; const d = data.stochRsiData.d[i]?.value;
            const pk = data.stochRsiData.k[i - 1]?.value; const pd = data.stochRsiData.d[i - 1]?.value;
            if (k === undefined || d === undefined || pk === undefined || pd === undefined) return false;
            return stochRsiCross(k, d, pk, pd);
        }
        case "dmi": {
            if (!data.dmiData) return false;
            const plus = data.dmiData.plusDI[i]?.value; const minus = data.dmiData.minusDI[i]?.value;
            const pPlus = data.dmiData.plusDI[i - 1]?.value; const pMinus = data.dmiData.minusDI[i - 1]?.value;
            if (plus === undefined || minus === undefined || pPlus === undefined || pMinus === undefined) return false;
            return dmiCross(plus, minus, pPlus, pMinus);
        }
        case "smi": {
            if (!data.smiData) return false;
            const smi = data.smiData.smi[i]?.value; const sig = data.smiData.signal[i]?.value;
            const ps = data.smiData.smi[i - 1]?.value; const pss = data.smiData.signal[i - 1]?.value;
            if (smi === undefined || sig === undefined || ps === undefined || pss === undefined) return false;
            return smiCross(smi, sig, ps, pss);
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            const p3 = arr[i - 3]?.value;
            if (cur === undefined || prev === undefined) return false;
            if (aoCross(cur, prev)) return true;
            if (p3 !== undefined && aoCross(cur, p3)) return true;
            return false;
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return mfiCross(cur, prev);
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return wprCross(cur, prev);
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            const p3 = arr[i - 3]?.value;
            if (cur === undefined || prev === undefined) return false;
            if (diCross(cur, prev)) return true;
            if (p3 !== undefined && diCross(cur, p3)) return true;
            return false;
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return cmfCross(cur, prev);
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            const sliceCur = arr.slice(Math.max(0, i - 20), i + 1).map(p => p.value).filter((v): v is number => v !== undefined);
            const slicePrev = arr.slice(Math.max(0, i - 21), i).map(p => p.value).filter((v): v is number => v !== undefined);
            if (sliceCur.length < 2 || slicePrev.length < 2) return false;
            const smaCur = sliceCur.reduce((a, b) => a + b, 0) / sliceCur.length;
            const smaPrev = slicePrev.reduce((a, b) => a + b, 0) / slicePrev.length;
            return adCross(cur, prev, smaCur, smaPrev);
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return netvolCross(cur, prev);
        }
        case "madr": {
            const arr = data.madrData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return madrCross(cur, prev);
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[i]?.value; const prevA = arr[i - 1]?.value;
            const curC = candles?.[i]?.close; const prevC = candles?.[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return false;
            return almaCross(curA, prevA, curC, prevC);
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[i]; const prevBB = arr[i - 1];
            const curC = candles?.[i]?.close; const prevC = candles?.[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined
                || curBB.lower === undefined || prevBB.lower === undefined
                || curBB.upper === undefined || prevBB.upper === undefined
                || curBB.basis === undefined || prevBB.basis === undefined) return false;
            return bbCross(
                curBB as import('@/lib/ta/signal-registry').BBPoint,
                prevBB as import('@/lib/ta/signal-registry').BBPoint,
                curC, prevC
            );
        }
        default: return false;
    }
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function StrategyBacktestMonitor({
    strategyName,
    candles,
    rsiData,
    cciData,
    waveTrendData,
    customIndicators,
    allData,
    config = { lookForward: 14 },
    mode = 'all',
    interval = '1d',
    initialOptimizedParams,
    discoveryWinRate,
    discoverySignalCount,
}: StrategyBacktestMonitorProps) {
    // Store the original (pre-optimization) backtest win rate so Reset can restore it
    const originalWinRateRef = useRef(discoveryWinRate ?? 0);

    const [stats, setStats] = useState<{
        winRate: number;
        totalSignals: number;
        wins: number;
        history: HistoryItem[];
    }>({
        winRate: discoveryWinRate ?? 0,
        totalSignals: discoverySignalCount ?? 0,
        wins: discoveryWinRate && discoverySignalCount ? Math.round((discoveryWinRate / 100) * discoverySignalCount) : 0,
        history: [],
    });
    const [animatedPercent, setAnimatedPercent] = useState(discoveryWinRate ?? 0);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedParams, setOptimizedParams] = useState<Record<string, number> | null>(initialOptimizedParams ?? null);
    const [optimizedWinRate, setOptimizedWinRate] = useState<number>(discoveryWinRate ?? 0);

    const isCustom = strategyName === "CUSTOM" && customIndicators && allData;
    // AI-discovered strategies are already at peak performance from the
    // Deep Discovery pipeline (GA + DE + localRefine). The optimize button
    // is disabled for these since re-optimizing is redundant.
    const isAIDiscovered = !!(discoveryWinRate && discoveryWinRate > 0);

    const handleOptimize = useCallback(async () => {
        if (!candles || candles.length === 0) return;
        if (!isCustom && strategyName !== "RSI_CCI_WT") return;

        setIsOptimizing(true);
        try {
            const indicators = isCustom && customIndicators
                ? customIndicators
                : ['rsi', 'cci', 'wavetrend'];

            // ── Sanitize data for server action serialization ────────────
            // Only include needed indicator data + deep-clone to strip non-serializable values
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
                // ✨ Override the main display with the optimized win rate,
                // so the circle + colors update to reflect the optimized result
                setAnimatedPercent(result.bestWinRate);
            }
        } catch (err) {
            console.error('[StrategyBacktestMonitor] Optimize failed:', err);
            // Reset state so the button works on retry after a crash
            setOptimizedParams(null);
            setOptimizedWinRate(0);
        } finally {
            setIsOptimizing(false);
        }
    }, [candles, isCustom, customIndicators, rsiData, cciData, waveTrendData, interval, mode]);

    // ── Helper: sanitize AllIndicatorData for safe server-action serialization ──
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
        // Deep-clone to strip any non-serializable values (undefined, Symbols, etc.)
        return JSON.parse(JSON.stringify(result));
    }

    const handleResetParams = useCallback(() => {
        if (initialOptimizedParams) {
            // Discovery-loaded strategy: restore discovery values
            setOptimizedParams(initialOptimizedParams);
            setOptimizedWinRate(discoveryWinRate ?? 0);
            setAnimatedPercent(discoveryWinRate ?? 0);
            setStats({
                winRate: discoveryWinRate ?? 0,
                totalSignals: discoverySignalCount ?? 0,
                wins: discoveryWinRate && discoverySignalCount
                    ? Math.round((discoveryWinRate / 100) * discoverySignalCount)
                    : 0,
                history: [],
            });
        } else {
            // Normal strategy: clear optimized state to show original backtest value
            setOptimizedParams(null);
            setOptimizedWinRate(0);
            setAnimatedPercent(originalWinRateRef.current);
        }
    }, [initialOptimizedParams, discoveryWinRate, discoverySignalCount]);

    // When candles/data change, reset optimized state
    useEffect(() => {
        setOptimizedParams(null);
        setOptimizedWinRate(0);
    }, [candles, customIndicators]);

    // Stabilize config reference to prevent infinite re-run
    const stableConfig = useRef(config);
    stableConfig.current = config;

    useEffect(() => {
        if (!candles || candles.length === 0) return;

        // ── Discovered strategies: use archived values for aggregate stats, ──
        // but still run the client-side backtest to populate the trade history
        // table. The server-side engine uses DST fusion + dynamic cooldown (ATR-based),
        // while this client-side engine uses simple voting + static cooldown.
        // We accept minor row-level discrepancies in exchange for a working
        // history table. The top-level Win Rate / Signals / Hits numbers
        // remain consistent with what was saved from the server.
        const isDiscovered = !!(discoveryWinRate && discoveryWinRate > 0);

        let wins = 0;
        let totalSignals = 0;
        const history: HistoryItem[] = [];
        const { lookForward } = stableConfig.current;

        // ── Cooldown: sinyalden sonra beklenecek bar sayısı (interval-aware) ──
        // SPRINT 3: 1wk kaldırıldı. 4h=15 bars (~3 trading days), default=5 trading days
        const defaultCooldown = interval === '4h' ? 15 : 5;
        const COOLDOWN_BARS = defaultCooldown;
        let lastSignalBar = -COOLDOWN_BARS;

        // Dynamic warmup — longer intervals need fewer candles skipped
        // SPRINT 3: 1wk kaldırıldı, sadece 1d ve 4h
        const strategyWarmup: Record<string, number> = {
            '1d': 55, '4h': 55,
        };
        const startIndex = strategyWarmup[interval] ?? 55;
        const endIndex = candles.length - lookForward;

        for (let i = startIndex; i < endIndex; i++) {
            const currentPrice = candles[i].close;
            const futurePrice = candles[i + lookForward].close;
            let signal: "BUY" | "SELL" | null = null;

            // ── Cooldown kontrolü ──────────────────────────────────────
            const cooldownOk = (i - lastSignalBar) >= COOLDOWN_BARS;

            // ══════════════════════════════════════════════════════════
            // BUILT-IN: RSI + CCI + WaveTrend
            //   • Tüm indikatörler aynı yönü göstermeli
            //   • En az 1 tanesinde taze crossover olmalı
            //   • Cooldown beklemesi yapılmalı
            // ══════════════════════════════════════════════════════════
            if (strategyName === "RSI_CCI_WT" && rsiData && cciData) {
                const rsi = rsiData.rsi[i]?.value; const rsiMa = rsiData.ma[i]?.value;
                const cci = cciData.cci[i]?.value; const cciMa = cciData.ma[i]?.value;

                if (rsi !== undefined && rsiMa !== undefined && cci !== undefined && cciMa !== undefined) {

                    const rsiSig = rsiSignal(rsi, rsiMa);
                    const cciSig = cciSignal(cci, cciMa);
                    let wtSig: "BUY" | "SELL" | null = null;

                    let wtAvail = false;
                    if (waveTrendData) {
                        const wt1 = waveTrendData.wt1[i]?.value; const wt2 = waveTrendData.wt2[i]?.value;
                        if (wt1 !== undefined && wt2 !== undefined) {
                            wtSig = waveTrendSignal(wt1, wt2);
                            wtAvail = true;
                        }
                    }

                    const totalVoters = wtAvail ? 3 : 2;
                    const buyVotes = (rsiSig === "BUY" ? 1 : 0) + (cciSig === "BUY" ? 1 : 0) + (wtSig === "BUY" ? 1 : 0);
                    const sellVotes = (rsiSig === "SELL" ? 1 : 0) + (cciSig === "SELL" ? 1 : 0) + (wtSig === "SELL" ? 1 : 0);

                    // En az 1 indikatörde taze crossover var mı?
                    let anyFreshCross = false;
                    if (hasFreshCrossover("rsi", i, { rsiData })) anyFreshCross = true;
                    if (!anyFreshCross && hasFreshCrossover("cci", i, { cciData })) anyFreshCross = true;
                    if (!anyFreshCross && wtAvail && hasFreshCrossover("wavetrend", i, { waveTrendData })) anyFreshCross = true;

                    const allAgree = (buyVotes === totalVoters) || (sellVotes === totalVoters);

                    if (allAgree && anyFreshCross && cooldownOk) {
                        signal = buyVotes === totalVoters ? "BUY" : "SELL";
                    }
                }
            }

            // ══════════════════════════════════════════════════════════
            // CUSTOM: seçili indikatörler oyluyor
            //   • mode='all'      → oy birliği (tümü aynı)
            //   • mode='majority'  → çoğunluk (>50%)
            //   • En az 1 taze crossover
            //   • Cooldown beklemesi
            // ══════════════════════════════════════════════════════════
            else if (isCustom) {
                const inds = customIndicators!;
                const data = allData!;

                let buyVotes = 0, sellVotes = 0, validVoters = 0;
                let anyFreshCross = false;

                for (const key of inds) {
                    const sig = getIndicatorSignal(key, i, data, candles);
                    if (sig === null) continue;   // veri yoksa sayma
                    validVoters++;
                    if (sig === "BUY") buyVotes++;
                    if (sig === "SELL") sellVotes++;

                    // Taze crossover kontrolü (en az 1 yeterli)
                    if (!anyFreshCross && hasFreshCrossover(key, i, data, candles)) {
                        anyFreshCross = true;
                    }
                }

                if (validVoters >= 2 && anyFreshCross && cooldownOk) {
                    if (mode === 'majority') {
                        if (buyVotes > validVoters / 2) signal = "BUY";
                        else if (sellVotes > validVoters / 2) signal = "SELL";
                    } else {
                        if (buyVotes === validVoters) signal = "BUY";
                        if (sellVotes === validVoters) signal = "SELL";
                    }
                }
            }

            if (signal) {
                totalSignals++;
                lastSignalBar = i;   // cooldown için son sinyal bar'ını kaydet
                const isWin = (signal === "BUY" && futurePrice > currentPrice) || (signal === "SELL" && futurePrice < currentPrice);
                if (isWin) wins++;

                history.push({
                    time: candles[i].time,
                    signal,
                    price: currentPrice,
                    futurePrice,
                    isWin
                });
            }
        }

        const calculatedWinRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
        // Store the original backtest result so Reset can restore it
        originalWinRateRef.current = calculatedWinRate;

        if (isDiscovered) {
            // Discovered strategy: keep aggregate stats consistent with server values,
            // but use the client-side backtest history for the trade table.
            const discoveryWins = discoverySignalCount
                ? Math.round((discoveryWinRate! / 100) * discoverySignalCount)
                : 0;
            setStats({
                winRate: discoveryWinRate!,
                totalSignals: discoverySignalCount ?? 0,
                wins: discoveryWins,
                history, // ← populated from actual backtest, NOT empty!
            });
            const timer = setTimeout(() => setAnimatedPercent(discoveryWinRate!), 300);
            return () => clearTimeout(timer);
        }

        setStats({ winRate: calculatedWinRate, totalSignals, wins, history });
        const timer = setTimeout(() => setAnimatedPercent(calculatedWinRate), 300);
        return () => clearTimeout(timer);
    }, [strategyName, candles, rsiData, cciData, waveTrendData, customIndicators, config.lookForward, discoveryWinRate, discoverySignalCount]);

    // ── UI ────────────────────────────────────────────────────────────────────
    // ✨ When optimized params are available, use optimized win rate for display
    const displayRate = optimizedParams ? optimizedWinRate : animatedPercent;

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

    // Hangi indikatörler gösterilecek
    const displayInds = isCustom
        ? customIndicators!.map(k => AVAILABLE_INDICATORS.find(i => i.key === k)?.label ?? k)
        : ["RSI", "CCI", "WT"];

    if (stats.totalSignals === 0) return (
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

                    {/* Optimize Button — disabled for AI-discovered strategies */}
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
                            ? "This strategy was already optimized by the Deep Discovery engine for maximum performance."
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
                        <DialogContent className="sm:max-w-[700px] bg-gray-950 border-gray-800 text-gray-100">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-violet-300">
                                    <History className="w-5 h-5" />
                                    Strateji Trade History
                                </DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="sticky top-0 bg-gray-950 text-gray-400 uppercase text-[10px] border-b border-gray-800">
                                        <tr>
                                            <th className="py-2 px-3">Date</th>
                                            <th className="py-2 px-3">Signal</th>
                                            <th className="py-2 px-3 text-right">Price</th>
                                            <th className="py-2 px-3 text-right">Target ({config.lookForward}G)</th>
                                            <th className="py-2 px-3 text-center">Result</th>
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

                {/* Optimized params display + reset */}
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
