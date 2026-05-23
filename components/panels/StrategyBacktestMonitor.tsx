"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AVAILABLE_INDICATORS } from "@/components/panels/CustomStrategyModal";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { History, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react";

type Candle = { time: string | number; close: number; high: number; low: number };
type Series = { time: string | number; value: number }[];

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
    bbData?: { time: string | number; basis: number; upper: number; lower: number }[]; // Bollinger Bands
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
            if (rsi > rsiMa && rsi < 62) return "BUY";
            if (rsi < rsiMa && rsi > 38) return "SELL";
            return null;
        }
        case "cci": {
            if (!data.cciData) return null;
            const cci = data.cciData.cci[i]?.value;
            if (cci === undefined) return null;
            if (cci > 0 && cci < 180) return "BUY";
            if (cci < 0 && cci > -180) return "SELL";
            return null;
        }
        case "wavetrend": {
            if (!data.waveTrendData) return null;
            const wt1 = data.waveTrendData.wt1[i]?.value;
            const wt2 = data.waveTrendData.wt2[i]?.value;
            if (wt1 === undefined || wt2 === undefined) return null;
            if (wt1 > wt2 && wt1 < 55) return "BUY";
            if (wt1 < wt2 && wt1 > -55) return "SELL";
            return null;
        }
        case "macd": {
            if (!data.macdData) return null;
            const macd = data.macdData.macd[i]?.value;
            const signal = data.macdData.signal[i]?.value;
            if (macd === undefined || signal === undefined) return null;
            if (macd > signal) return "BUY";
            if (macd < signal) return "SELL";
            return null;
        }
        case "stochrsi": {
            if (!data.stochRsiData) return null;
            const k = data.stochRsiData.k[i]?.value;
            const d = data.stochRsiData.d[i]?.value;
            if (k === undefined || d === undefined) return null;
            if (k > d && k < 80) return "BUY";
            if (k < d && k > 20) return "SELL";
            return null;
        }
        case "dmi": {
            if (!data.dmiData) return null;
            const plus = data.dmiData.plusDI[i]?.value;
            const minus = data.dmiData.minusDI[i]?.value;
            const adx = data.dmiData.adx[i]?.value;
            if (plus === undefined || minus === undefined || adx === undefined) return null;
            if (plus > minus && adx > 20) return "BUY";
            if (minus > plus && adx > 20) return "SELL";
            return null;
        }
        case "smi": {
            if (!data.smiData) return null;
            const smi = data.smiData.smi[i]?.value;
            const signal = data.smiData.signal[i]?.value;
            if (smi === undefined || signal === undefined) return null;
            if (smi > signal) return "BUY";
            if (smi < signal) return "SELL";
            return null;
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return null;
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur < 20) return "BUY";
            if (cur > 80) return "SELL";
            if (cur > prev) return "BUY";
            if (cur < prev) return "SELL";
            return null;
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur < -80) return "BUY";
            if (cur > -20) return "SELL";
            if (cur > prev) return "BUY";
            if (cur < prev) return "SELL";
            return null;
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return null;
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            if (cur > 0.05) return "BUY";
            if (cur < -0.05) return "SELL";
            return null;
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            // SMA-21 bazlı: mevcut değer MA'nın üzerindeyse AL
            const slice = arr.slice(Math.max(0, i - 20), i + 1).map(p => p.value);
            if (slice.length < 2) return null;
            const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
            return cur > sma ? "BUY" : "SELL";
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur > 0 && cur > prev) return "BUY";
            if (cur < 0 && cur < prev) return "SELL";
            return null;
        }
        case "madr": {
            const arr = data.madrData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            if (cur > 0) return "BUY";
            if (cur < 0) return "SELL";
            return null;
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[i]?.value;
            const prevA = arr[i - 1]?.value;
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return null;
            if (prevC < prevA && curC > curA) return "BUY";
            if (prevC > prevA && curC < curA) return "SELL";
            return null;
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[i];
            const prevBB = arr[i - 1];
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return null;
            if (prevC < prevBB.lower && curC > curBB.lower) return "BUY";
            if (prevC > prevBB.upper && curC < curBB.upper) return "SELL";
            return null;
        }
        default:
            return null;
    }
}

// ─── Crossover kontrolü ───────────────────────────────────────────────────────
function hasFreshCrossover(key: string, i: number, data: AllIndicatorData, candles?: Candle[]): boolean {
    switch (key) {
        case "rsi": {
            if (!data.rsiData) return false;
            const rsi = data.rsiData.rsi[i]?.value; const rsiMa = data.rsiData.ma[i]?.value;
            const p1 = data.rsiData.rsi[i - 1]?.value; const p1Ma = data.rsiData.ma[i - 1]?.value;
            const p3 = data.rsiData.rsi[i - 3]?.value; const p3Ma = data.rsiData.ma[i - 3]?.value;
            if (rsi === undefined || rsiMa === undefined) return false;
            return (p1 !== undefined && p1Ma !== undefined && ((p1 <= p1Ma && rsi > rsiMa) || (p1 >= p1Ma && rsi < rsiMa))) ||
                (p3 !== undefined && p3Ma !== undefined && ((p3 <= p3Ma && rsi > rsiMa) || (p3 >= p3Ma && rsi < rsiMa)));
        }
        case "cci": {
            if (!data.cciData) return false;
            const cci = data.cciData.cci[i]?.value;
            const p1 = data.cciData.cci[i - 1]?.value;
            const p3 = data.cciData.cci[i - 3]?.value;
            if (cci === undefined) return false;
            return (p1 !== undefined && ((p1 <= 0 && cci > 0) || (p1 >= 0 && cci < 0))) ||
                (p3 !== undefined && ((p3 <= 0 && cci > 0) || (p3 >= 0 && cci < 0)));
        }
        case "wavetrend": {
            if (!data.waveTrendData) return false;
            const wt1 = data.waveTrendData.wt1[i]?.value; const wt2 = data.waveTrendData.wt2[i]?.value;
            const pw1 = data.waveTrendData.wt1[i - 1]?.value; const pw2 = data.waveTrendData.wt2[i - 1]?.value;
            const p3w1 = data.waveTrendData.wt1[i - 3]?.value; const p3w2 = data.waveTrendData.wt2[i - 3]?.value;
            if (wt1 === undefined || wt2 === undefined) return false;
            return (pw1 !== undefined && pw2 !== undefined && ((pw1 <= pw2 && wt1 > wt2) || (pw1 >= pw2 && wt1 < wt2))) ||
                (p3w1 !== undefined && p3w2 !== undefined && ((p3w1 <= p3w2 && wt1 > wt2) || (p3w1 >= p3w2 && wt1 < wt2)));
        }
        case "macd": {
            if (!data.macdData) return false;
            const macd = data.macdData.macd[i]?.value; const sig = data.macdData.signal[i]?.value;
            const pm = data.macdData.macd[i - 1]?.value; const ps = data.macdData.signal[i - 1]?.value;
            if (macd === undefined || sig === undefined || pm === undefined || ps === undefined) return false;
            return (pm <= ps && macd > sig) || (pm >= ps && macd < sig);
        }
        case "stochrsi": {
            if (!data.stochRsiData) return false;
            const k = data.stochRsiData.k[i]?.value; const d = data.stochRsiData.d[i]?.value;
            const pk = data.stochRsiData.k[i - 1]?.value; const pd = data.stochRsiData.d[i - 1]?.value;
            if (k === undefined || d === undefined || pk === undefined || pd === undefined) return false;
            return (pk <= pd && k > d) || (pk >= pd && k < d);
        }
        case "dmi": {
            if (!data.dmiData) return false;
            const plus = data.dmiData.plusDI[i]?.value; const minus = data.dmiData.minusDI[i]?.value;
            const pPlus = data.dmiData.plusDI[i - 1]?.value; const pMinus = data.dmiData.minusDI[i - 1]?.value;
            if (plus === undefined || minus === undefined || pPlus === undefined || pMinus === undefined) return false;
            return (pPlus <= pMinus && plus > minus) || (pPlus >= pMinus && plus < minus);
        }
        case "smi": {
            if (!data.smiData) return false;
            const smi = data.smiData.smi[i]?.value; const sig = data.smiData.signal[i]?.value;
            const ps = data.smiData.smi[i - 1]?.value; const pss = data.smiData.signal[i - 1]?.value;
            if (smi === undefined || sig === undefined || ps === undefined || pss === undefined) return false;
            return (ps <= pss && smi > sig) || (ps >= pss && smi < sig);
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            const p3 = arr[i - 3]?.value;
            if (cur === undefined || prev === undefined) return false;
            return ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) ||
                (p3 !== undefined && ((p3 <= 0 && cur > 0) || (p3 >= 0 && cur < 0)));
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            // 50 çizgisini geçiyor mu?
            return (prev < 50 && cur >= 50) || (prev > 50 && cur <= 50);
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            // -50 çizgisini geçiyor mu?
            return (prev < -50 && cur >= -50) || (prev > -50 && cur <= -50);
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            const p3 = arr[i - 3]?.value;
            if (cur === undefined || prev === undefined) return false;
            return ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) ||
                (p3 !== undefined && ((p3 <= 0 && cur > 0) || (p3 >= 0 && cur < 0)));
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return (prev <= 0 && cur > 0) || (prev >= 0 && cur < 0);
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            const sliceCur = arr.slice(Math.max(0, i - 20), i + 1).map(p => p.value);
            const slicePrev = arr.slice(Math.max(0, i - 21), i).map(p => p.value);
            if (sliceCur.length < 2 || slicePrev.length < 2) return false;
            const smaCur = sliceCur.reduce((a, b) => a + b, 0) / sliceCur.length;
            const smaPrev = slicePrev.reduce((a, b) => a + b, 0) / slicePrev.length;
            return (prev <= smaPrev && cur > smaCur) || (prev >= smaPrev && cur < smaCur);
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return (prev <= 0 && cur > 0) || (prev >= 0 && cur < 0);
        }
        case "madr": {
            const arr = data.madrData ?? [];
            const cur = arr[i]?.value; const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return false;
            return (prev < 0 && cur >= 0) || (prev > 0 && cur <= 0);
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[i]?.value; const prevA = arr[i - 1]?.value;
            const curC = candles?.[i]?.close; const prevC = candles?.[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return false;
            return (prevC <= prevA && curC > curA) || (prevC >= prevA && curC < curA);
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[i]; const prevBB = arr[i - 1];
            const curC = candles?.[i]?.close; const prevC = candles?.[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return false;
            return (prevC <= prevBB.lower && curC > curBB.lower) || (prevC >= prevBB.upper && curC < curBB.upper);
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
}: StrategyBacktestMonitorProps) {
    const [stats, setStats] = useState<{
        winRate: number;
        totalSignals: number;
        wins: number;
        history: HistoryItem[];
    }>({ winRate: 0, totalSignals: 0, wins: 0, history: [] });
    const [animatedPercent, setAnimatedPercent] = useState(0);

    const isCustom = strategyName === "CUSTOM" && customIndicators && allData;

    useEffect(() => {
        if (!candles || candles.length === 0) return;

        let wins = 0;
        let totalSignals = 0;
        const history: HistoryItem[] = [];
        const { lookForward } = config;
        const COOLDOWN_BARS = 5;
        let lastSignalBar = -999;

        const startIndex = 55;
        const endIndex = candles.length - lookForward;

        for (let i = startIndex; i < endIndex; i++) {
            const currentPrice = candles[i].close;
            const futurePrice = candles[i + lookForward].close;
            let signal: "BUY" | "SELL" | null = null;
            const cooldownOk = (i - lastSignalBar) >= COOLDOWN_BARS;

            // ══════════════════════════════════════════════════════════
            // BUILT-IN: RSI + CCI + WaveTrend
            // ══════════════════════════════════════════════════════════
            if (strategyName === "RSI_CCI_WT" && rsiData && cciData) {
                const rsi = rsiData.rsi[i]?.value; const rsiMa = rsiData.ma[i]?.value;
                const cci = cciData.cci[i]?.value;
                const prevRsi = rsiData.rsi[i - 1]?.value; const prevRsiMa = rsiData.ma[i - 1]?.value;
                const prevCci = cciData.cci[i - 1]?.value;
                const rsi3 = rsiData.rsi[i - 3]?.value; const rsiMa3 = rsiData.ma[i - 3]?.value;
                const cci3 = cciData.cci[i - 3]?.value;

                if (rsi !== undefined && rsiMa !== undefined && cci !== undefined &&
                    prevRsi !== undefined && prevRsiMa !== undefined && prevCci !== undefined &&
                    rsi3 !== undefined && rsiMa3 !== undefined && cci3 !== undefined) {

                    const rsiBuy = rsi > rsiMa && rsi < 62;
                    const rsiSell = rsi < rsiMa && rsi > 38;
                    const cciBuy = cci > 0 && cci < 180;
                    const cciSell = cci < 0 && cci > -180;

                    let wtBuy = false, wtSell = false, wtAvail = false, wtCrossUp = false, wtCrossDn = false;
                    if (waveTrendData) {
                        const wt1 = waveTrendData.wt1[i]?.value; const wt2 = waveTrendData.wt2[i]?.value;
                        const pw1 = waveTrendData.wt1[i - 1]?.value; const pw2 = waveTrendData.wt2[i - 1]?.value;
                        const w13 = waveTrendData.wt1[i - 3]?.value; const w23 = waveTrendData.wt2[i - 3]?.value;
                        if (wt1 !== undefined && wt2 !== undefined && pw1 !== undefined && pw2 !== undefined) {
                            wtBuy = wt1 > wt2 && wt1 < 55;
                            wtSell = wt1 < wt2 && wt1 > -55;
                            wtAvail = true;
                            wtCrossUp = (pw1 <= pw2 && wt1 > wt2) || (w13 !== undefined && w23 !== undefined && w13 <= w23 && wt1 > wt2);
                            wtCrossDn = (pw1 >= pw2 && wt1 < wt2) || (w13 !== undefined && w23 !== undefined && w13 >= w23 && wt1 < wt2);
                        }
                    }

                    const totalVoters = wtAvail ? 3 : 2;
                    const buyVotes = (rsiBuy ? 1 : 0) + (cciBuy ? 1 : 0) + (wtAvail && wtBuy ? 1 : 0);
                    const sellVotes = (rsiSell ? 1 : 0) + (cciSell ? 1 : 0) + (wtAvail && wtSell ? 1 : 0);

                    const rsiCrossUp1 = prevRsi <= prevRsiMa && rsi > rsiMa;
                    const rsiCrossDn1 = prevRsi >= prevRsiMa && rsi < rsiMa;
                    const rsiCrossUp3 = rsi3 <= rsiMa3 && rsi > rsiMa;
                    const rsiCrossDn3 = rsi3 >= rsiMa3 && rsi < rsiMa;
                    const cciCrossUp1 = prevCci <= 0 && cci > 0;
                    const cciCrossDn1 = prevCci >= 0 && cci < 0;
                    const cciCrossUp3 = cci3 <= 0 && cci > 0;
                    const cciCrossDn3 = cci3 >= 0 && cci < 0;

                    const freshBuy = rsiCrossUp1 || rsiCrossUp3 || cciCrossUp1 || cciCrossUp3 || wtCrossUp;
                    const freshSell = rsiCrossDn1 || rsiCrossDn3 || cciCrossDn1 || cciCrossDn3 || wtCrossDn;

                    if (buyVotes === totalVoters && freshBuy && cooldownOk) signal = "BUY";
                    if (sellVotes === totalVoters && freshSell && cooldownOk) signal = "SELL";
                }
            }

            // ══════════════════════════════════════════════════════════
            // CUSTOM: seçili tüm indikatörler oyluyor, hepsi oy birliği
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
                    if (hasFreshCrossover(key, i, data, candles)) anyFreshCross = true;
                }

                // Tüm geçerli indikatörler oy birliği + en az 1 crossover + cooldown
                if (validVoters >= 2 && anyFreshCross && cooldownOk) {
                    if (buyVotes === validVoters) signal = "BUY";
                    if (sellVotes === validVoters) signal = "SELL";
                }
            }

            if (signal) {
                totalSignals++;
                lastSignalBar = i;
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
        setStats({ winRate: calculatedWinRate, totalSignals, wins, history });
        const timer = setTimeout(() => setAnimatedPercent(calculatedWinRate), 300);
        return () => clearTimeout(timer);
    }, [strategyName, candles, rsiData, cciData, waveTrendData, customIndicators, allData, config]);

    // ── UI ────────────────────────────────────────────────────────────────────
    const size = 64, strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (animatedPercent / 100) * circumference;

    let colorClass = "text-gray-500";
    if (animatedPercent >= 68) colorClass = "text-emerald-300 drop-shadow-[0_0_12px_rgba(110,231,183,0.7)]";
    else if (animatedPercent >= 62) colorClass = "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.6)]";
    else if (animatedPercent >= 55) colorClass = "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    else if (animatedPercent >= 48) colorClass = "text-yellow-500";
    else if (animatedPercent > 0) colorClass = "text-red-500";

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
                    <span className={cn("text-sm font-bold", colorClass)}>%{animatedPercent.toFixed(0)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">Strateji Backtesting</span>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-300 font-medium bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                        {stats.totalSignals} Signal
                    </span>
                    <span className="text-[11px] text-gray-400">{stats.wins} Hit</span>

                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="ml-auto p-1 hover:bg-violet-900/40 rounded transition-colors text-violet-400 hover:text-violet-200" title="Trade History">
                                <History className="w-3.5 h-3.5" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800 text-gray-100">
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
