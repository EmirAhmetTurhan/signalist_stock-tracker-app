// lib/ta/strategy-optimizer/run-backtest.ts
// Ported from monolith strategy-optimizer.ts

import type { Candle, BacktestHistoryItem } from '../simulation/backtest';
import {
    rsiSignal, cciSignal, waveTrendSignal, macdSignal,
    stochRsiSignal, dmiSignal, smiSignal, aoSignal,
    mfiSignal, wprSignal, diSignal, cmfSignal, adSignal,
    netvolSignal, madrSignal, almaSignal, bbSignal,
    rsiCross, cciCross, waveTrendCross, macdCross,
    stochRsiCross, dmiCross, smiCross, aoCross,
    mfiCross, wprCross, diCross, cmfCross, adCross,
    netvolCross, madrCross, almaCross, bbCross,
    type BBPoint,
    signalToBBA, fuseAll,
    efficiencyRatio,
    computePSR,
} from '../registry/signal-registry';
import type { StrategyMode, MarketRegime, BBA, RegimeStats, SignalProfile, EvaluationMode, ComputedIndicators } from '../types';
import { classifyRegime } from '../regime-detector';
import { simulateTrade, type TradeRiskConfig } from '../simulation/trade-simulator';
import type { BacktestLogEntry, IndicatorLogEntry } from '../simulation/backtest-log';
import { assertAllowedTimeframe } from '../timeframe-guard';

import type { PortfolioSimResult, PortfolioSignalEntry } from '../simulation/portfolio-simulator';

import type {
    AllData,
    StrategyBacktestConfig,
    StrategyBacktestResult,
    ProfileConfig,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map ComputedIndicators → AllData (compatible with StrategyBacktestMonitor) */
export function mapComputedToAllData(computed: ComputedIndicators): AllData {
    return {
        // SPRINT 1 / B4.2: RSI confidence pass-through — warmup/fallback barları DST'de sıfır güç alacak
        rsiData: computed.rsi
            ? { rsi: computed.rsi.rsi, ma: computed.rsi.ma, confidence: computed.rsi.confidence }
            : undefined,
        cciData: computed.cci ? { cci: computed.cci.cci, ma: computed.cci.ma } : undefined,
        // SPRINT 1 / B4.2: WaveTrend wt1/wt2 confidence pass-through
        waveTrendData: computed.wavetrend
            ? {
                wt1: computed.wavetrend.wt1,
                wt2: computed.wavetrend.wt2,
                crosses: computed.wavetrend.crosses,
                wt1Confidence: computed.wavetrend.wt1Confidence,
                wt2Confidence: computed.wavetrend.wt2Confidence,
            }
            : undefined,
        macdData: computed.macd
            ? { macd: computed.macd.macd, signal: computed.macd.signal, histogram: computed.macd.histogram }
            : undefined,
        stochRsiData: computed.stochrsi ? { k: computed.stochrsi.k, d: computed.stochrsi.d } : undefined,
        dmiData: computed.dmi
            ? { plusDI: computed.dmi.plusDI, minusDI: computed.dmi.minusDI, adx: computed.dmi.adx }
            : undefined,
        smiData: computed.smi ? { smi: computed.smi.smi, signal: computed.smi.signal } : undefined,
        aoData: computed.ao,
        mfiData: computed.mfi ? { mfi: computed.mfi.mfi } : undefined,
        wprData: computed.wpr,
        diData: computed.di,
        cmfData: computed.cmf,
        adData: computed.ad,
        nvData: computed.netvol,
        madrData: computed.madr,
        almaData: computed.alma,
        bbData: computed.bb as unknown as AllData['bbData'],
    };
}

// ─── Per-bar signal calculator (mirrors getIndicatorSignal from StrategyBacktestMonitor) ──

export function getIndicatorSignal(
    key: string,
    i: number,
    data: AllData,
    candles?: Candle[]
): "BUY" | "SELL" | null {
    switch (key) {
        case "rsi": {
            if (!data.rsiData) return null;
            // SPRINT 1 / B4.2: Confidence gate — warmup/fallback barları oylamaya katılmaz
            if (data.rsiData.confidence && data.rsiData.confidence[i] === 0) return null;
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
            // SPRINT 1 / B4.2: wt1 ve wt2'nin ikisi de confidence=1 olmalı
            const w1Conf = data.waveTrendData.wt1Confidence?.[i];
            const w2Conf = data.waveTrendData.wt2Confidence?.[i];
            if (w1Conf === 0 || w2Conf === 0) return null;
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
            if (plus === undefined || minus === undefined) return null;
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
            const adObj = data.adData;
            if (!adObj) return null;
            const cur = adObj.ad[i]?.value;
            const curSma = adObj.ma[i]?.value;
            if (cur === undefined || curSma === undefined) return null;
            return adSignal(cur, curSma);
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
            return bbSignal(curBB as unknown as BBPoint, prevBB as unknown as BBPoint, curC, prevC);
        }
        default:
            return null;
    }
}

// ─── Per-bar crossover check (mirrors hasFreshCrossover from StrategyBacktestMonitor) ──

export function hasFreshCrossover(
    key: string,
    i: number,
    data: AllData,
    candles?: Candle[]
): boolean {
    switch (key) {
        case "rsi": {
            if (!data.rsiData || i < 7) return false;
            const curRsi = data.rsiData.rsi[i]?.value;
            const curMa = data.rsiData.ma[i]?.value;
            if (curRsi === undefined || curMa === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pkRsi = data.rsiData.rsi[i - k]?.value;
                const pkMa = data.rsiData.ma[i - k]?.value;
                if (pkRsi !== undefined && pkMa !== undefined && rsiCross(curRsi, curMa, pkRsi, pkMa)) return true;
            }
            return false;
        }
        case "cci": {
            if (!data.cciData || i < 7) return false;
            const curCci = data.cciData.cci[i]?.value;
            if (curCci === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pkCci = data.cciData.cci[i - k]?.value;
                if (pkCci !== undefined && cciCross(curCci, pkCci)) return true;
            }
            return false;
        }
        case "wavetrend": {
            if (!data.waveTrendData || i < 7) return false;
            const cur1 = data.waveTrendData.wt1[i]?.value;
            const cur2 = data.waveTrendData.wt2[i]?.value;
            if (cur1 === undefined || cur2 === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pkw1 = data.waveTrendData.wt1[i - k]?.value;
                const pkw2 = data.waveTrendData.wt2[i - k]?.value;
                if (pkw1 !== undefined && pkw2 !== undefined && waveTrendCross(cur1, cur2, pkw1, pkw2)) return true;
            }
            return false;
        }
        case "macd": {
            if (!data.macdData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curMacd = data.macdData.macd[j]?.value;
                const curSig = data.macdData.signal[j]?.value;
                const prevMacd = data.macdData.macd[j - 1]?.value;
                const prevSig = data.macdData.signal[j - 1]?.value;
                if ([curMacd, curSig, prevMacd, prevSig].some(v => v === undefined)) continue;
                if (macdCross(curMacd!, curSig!, prevMacd!, prevSig!)) return true;
            }
            return false;
        }
        case "stochrsi": {
            if (!data.stochRsiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curK = data.stochRsiData.k[j]?.value;
                const curD = data.stochRsiData.d[j]?.value;
                const prevK = data.stochRsiData.k[j - 1]?.value;
                const prevD = data.stochRsiData.d[j - 1]?.value;
                if ([curK, curD, prevK, prevD].some(v => v === undefined)) continue;
                if (stochRsiCross(curK!, curD!, prevK!, prevD!)) return true;
            }
            return false;
        }
        case "dmi": {
            if (!data.dmiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curP = data.dmiData.plusDI[j]?.value;
                const curM = data.dmiData.minusDI[j]?.value;
                const prevP = data.dmiData.plusDI[j - 1]?.value;
                const prevM = data.dmiData.minusDI[j - 1]?.value;
                if ([curP, curM, prevP, prevM].some(v => v === undefined)) continue;
                if (dmiCross(curP!, curM!, prevP!, prevM!)) return true;
            }
            return false;
        }
        case "smi": {
            if (!data.smiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curSmi = data.smiData.smi[j]?.value;
                const curSig = data.smiData.signal[j]?.value;
                const prevSmi = data.smiData.smi[j - 1]?.value;
                const prevSig = data.smiData.signal[j - 1]?.value;
                if ([curSmi, curSig, prevSmi, prevSig].some(v => v === undefined)) continue;
                if (smiCross(curSmi!, curSig!, prevSmi!, prevSig!)) return true;
            }
            return false;
        }
        case "ao": {
            const arr = data.aoData ?? [];
            if (i < 7) return false;
            const cur = arr[i]?.value;
            if (cur === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pk = arr[i - k]?.value;
                if (pk !== undefined && aoCross(cur, pk)) return true;
            }
            return false;
        }
        case "mfi": {
            if (!data.mfiData || i < 7) return false;
            const arr = data.mfiData.mfi;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (mfiCross(cur, prev)) return true;
            }
            return false;
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (wprCross(cur, prev)) return true;
            }
            return false;
        }
        case "di": {
            const arr = data.diData ?? [];
            if (i < 7) return false;
            const cur = arr[i]?.value;
            if (cur === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pk = arr[i - k]?.value;
                if (pk !== undefined && diCross(cur, pk)) return true;
            }
            return false;
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (cmfCross(cur, prev)) return true;
            }
            return false;
        }
        case "ad": {
            const adObj = data.adData;
            if (!adObj || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = adObj.ad[j]?.value;
                const prev = adObj.ad[j - 1]?.value;
                const curSma = adObj.ma[j]?.value;
                const prevSma = adObj.ma[j - 1]?.value;
                if (cur === undefined || prev === undefined || curSma === undefined || prevSma === undefined) continue;
                if (adCross(cur, prev, curSma, prevSma)) return true;
            }
            return false;
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (netvolCross(cur, prev)) return true;
            }
            return false;
        }
        case "madr": {
            const arr = data.madrData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (madrCross(cur, prev)) return true;
            }
            return false;
        }
        case "alma": {
            const arr = data.almaData ?? [];
            if (!candles || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curA = arr[j]?.value;
                const prevA = arr[j - 1]?.value;
                const curC = candles[j]?.close;
                const prevC = candles[j - 1]?.close;
                if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) continue;
                if (almaCross(curA, prevA, curC, prevC)) return true;
            }
            return false;
        }
        case "bb": {
            const arr = data.bbData ?? [];
            if (!candles || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curBB = arr[j];
                const prevBB = arr[j - 1];
                const curC = candles[j]?.close;
                const prevC = candles[j - 1]?.close;
                if (!curBB || !prevBB || curC === undefined || prevC === undefined) continue;
                if (curBB.lower === undefined || prevBB.lower === undefined || curBB.upper === undefined || prevBB.upper === undefined) continue;
                if (bbCross(curBB as unknown as BBPoint, prevBB as unknown as BBPoint, curC, prevC)) return true;
            }
            return false;
        }
        default:
            return false;
    }
}

// ─── ATR, Dynamic Cooldown & Market Regime Detection ────────────────────────

export function computeATR(candles: Candle[], period: number = 14): number[] {
    const atr: number[] = [];
    if (candles.length === 0) return atr;

    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

        if (i < period) {
            sumTR += tr;
            atr.push(sumTR / (i + 1));
        } else if (i === period) {
            sumTR += tr;
            atr.push(sumTR / period);
        } else {
            atr.push((atr[i - 1] * (period - 1) + tr) / period);
        }
    }
    return atr;
}

// ─── Signal Profile Configuration ──────────────────────────────────────────

export const PROFILE_CONFIGS: Record<SignalProfile, ProfileConfig> = {
    TrendFollower: {
        tradeThreshold: 0.25,
        baseCooldown: 5,
        gamma: 0.7,
        cooldownMin: 2,
        cooldownMax: 10,
        requireCrossover: false,
        volatilityLookback: 30,
        stopLossAtrMult: 3.0,
        takeProfitR: 4.0,
        useTrailingStop: true,
        trailAtrMult: 2.5,
        transactionCostPct: 0.10,
    },
    SwingTrader: {
        tradeThreshold: 0.30,
        baseCooldown: 3,
        gamma: 0.8,
        cooldownMin: 1,
        cooldownMax: 6,
        requireCrossover: false,
        volatilityLookback: 30,
        stopLossAtrMult: 2.0,
        takeProfitR: 2.5,
        useTrailingStop: true,
        trailAtrMult: 1.5,
        transactionCostPct: 0.10,
    },
    Aggressive: {
        tradeThreshold: 0.15,
        baseCooldown: 3,
        gamma: 1.0,
        cooldownMin: 1,
        cooldownMax: 8,
        requireCrossover: false,
        volatilityLookback: 30,
        stopLossAtrMult: 1.5,
        takeProfitR: 1.5,
        useTrailingStop: true,
        trailAtrMult: 0.5,
        transactionCostPct: 0.10,
    },
    Balanced: {
        tradeThreshold: 0.40,
        baseCooldown: 5,
        gamma: 0.7,
        cooldownMin: 2,
        cooldownMax: 14,
        requireCrossover: true,
        volatilityLookback: 30,
        stopLossAtrMult: 2.0,
        takeProfitR: 2.0,
        useTrailingStop: false,
        trailAtrMult: 0,
        transactionCostPct: 0.10,
    },
    Conservative: {
        tradeThreshold: 0.65,
        baseCooldown: 7,
        gamma: 0.5,
        cooldownMin: 3,
        cooldownMax: 20,
        requireCrossover: true,
        volatilityLookback: 30,
        stopLossAtrMult: 2.5,
        takeProfitR: 3.0,
        useTrailingStop: false,
        trailAtrMult: 0,
    },
};

export function getProfileConfig(config?: StrategyBacktestConfig): ProfileConfig {
    if (config?.signalProfile) {
        return PROFILE_CONFIGS[config.signalProfile];
    }
    return PROFILE_CONFIGS.TrendFollower;
}

export function getDynamicCooldown(
    atrValues: number[],
    i: number,
    interval: string,
    config?: StrategyBacktestConfig
): number {
    if (config?.cooldownBars !== undefined) return config.cooldownBars;

    const profile = getProfileConfig(config);
    const baseCD = profile.baseCooldown;
    const lookback = profile.volatilityLookback;

    const intervalFactor = interval === '4h' ? 1.5 : 1.0;
    const adjustedBase = Math.max(1, Math.round(baseCD * intervalFactor));

    if (i < lookback + 14 || i >= atrValues.length) return adjustedBase;

    const currentATR = atrValues[i];

    const lookbackStart = i - lookback;
    let sum = 0;
    for (let j = lookbackStart; j <= i; j++) {
        sum += atrValues[j];
    }
    const avgATR = sum / (lookback + 1);

    if (currentATR < 1e-10 || avgATR < 1e-10) return adjustedBase;

    const gamma = profile.gamma;
    const dynamicCD = Math.ceil(adjustedBase * Math.pow(avgATR / currentATR, gamma));

    return Math.max(profile.cooldownMin, Math.min(profile.cooldownMax, dynamicCD));
}

export function detectRegime(candles: Candle[], i: number, atrValues: number[]): MarketRegime {
    if (i < 30) return 'neutral';

    let sumClose = 0;
    for (let j = i - 19; j <= i; j++) {
        sumClose += candles[j].close;
    }
    const sma20 = sumClose / 20;

    let sumPrev = 0;
    for (let j = i - 29; j <= i - 10; j++) {
        sumPrev += candles[j].close;
    }
    const prevSMA = sumPrev / 20;
    const maSlope = prevSMA !== 0 ? ((sma20 - prevSMA) / prevSMA) * 100 : 0;

    const currentATR = atrValues[i] ?? 0;
    let sumATR = 0;
    const atrStart = Math.max(0, i - 19);
    for (let j = atrStart; j <= i; j++) {
        sumATR += atrValues[j] ?? currentATR;
    }
    const avgATR = sumATR / (i - atrStart + 1);
    const volRatio = avgATR > 0 ? currentATR / avgATR : 1;

    let upSum = 0, downSum = 0;
    const adxStart = Math.max(1, i - 13);
    for (let j = adxStart; j <= i; j++) {
        const move = candles[j].close - candles[j - 1].close;
        if (move > 0) upSum += move;
        else downSum -= move;
    }
    const totalMove = upSum + downSum;
    const adxApprox = totalMove > 0 ? (upSum / totalMove) * 100 : 50;

    const isVolatile = volRatio > 1.8;
    const isTrending = Math.abs(maSlope) > 0.3 && (adxApprox > 60 || Math.abs(maSlope) > 0.5);
    const isRanging = Math.abs(maSlope) < 0.15 && volRatio < 1.2;
    const isUptrend = maSlope > 0;
    const isDowntrend = maSlope < 0;

    if (isVolatile) return 'volatile';
    if (isTrending && isUptrend) return 'uptrend';
    if (isTrending && isDowntrend) return 'downtrend';
    if (isRanging) return 'ranging';
    return 'neutral';
}

export function getBetaPosterior(
    wins: number,
    losses: number,
    priorAlpha: number = 1,
    priorBeta: number = 1
): number {
    const alpha = priorAlpha + wins;
    const beta = priorBeta + losses;
    if (alpha + beta <= 0) return 0.5;
    return alpha / (alpha + beta);
}

// ─── Train/Test Overfitting Generalization Score ───

export function evaluateGeneralizationScore(
    trainWR: number,
    testWR: number,
    minSignals: number = 20
): number {
    if (trainWR <= 0 || testWR <= 0) return 0;
    const harmonicMean = 2 * (trainWR * testWR) / (trainWR + testWR);
    const gap = Math.abs(trainWR - testWR);
    const maxWR = Math.max(trainWR, testWR);
    const overfitPenalty = maxWR > 0 ? gap / maxWR : 1;
    return harmonicMean * (1 - overfitPenalty * 0.5);
}

// ─── 1. Pure-function strategy backtest engine ────────────────────────────────

export function runStrategyBacktest(
    candles: Candle[],
    strategyName: string,
    allData: AllData,
    config: StrategyBacktestConfig = { lookForward: 5 },
    options: {
        customIndicators?: string[];
        mode?: StrategyMode;
        interval?: string;
        indicatorConfidences?: Record<string, number>;
    } = {}
): StrategyBacktestResult {
    if (!candles || candles.length === 0) {
        const emptyBreakdown = {
            uptrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            downtrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            ranging: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            volatile: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            neutral: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
        } as Record<MarketRegime, RegimeStats>;
        return {
            winRate: 0, totalSignals: 0, wins: 0, history: [],
            profitFactor: 0, sharpeRatio: 0, avgWin: 0, avgLoss: 0,
            maxDrawdown: 0, totalReturn: 0, regimeBreakdown: emptyBreakdown,
        };
    }

    let wins = 0;
    let totalSignals = 0;
    const history: BacktestHistoryItem[] = [];
    const debugLog: BacktestLogEntry[] = [];

    let grossProfit = 0;
    let grossLoss = 0;
    let winningSum = 0;
    let losingSum = 0;
    let winningCount = 0;
    let losingCount = 0;
    let totalReturnPct = 0;
    let peakEquity = 0;
    let maxDrawdown = 0;
    const tradeReturns: number[] = [];
    const regimeWins: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };
    const regimeSignals: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };
    const regimeReturnSums: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };

    const { lookForward } = config;
    const mode = options.mode ?? 'all';

    const interval = assertAllowedTimeframe(options.interval ?? '1d', 'strategy-optimizer.runStrategyBacktest');
    const isCustom = strategyName === 'CUSTOM' && options.customIndicators && options.customIndicators.length > 0;

    const atrValues = computeATR(candles, 14);

    if (!allData.regimeData) {
        (allData as any).regimeData = [];
    }
    const regimeData = allData.regimeData!;

    const baseWarmup = 55;
    const startIndex = Math.min(baseWarmup, Math.floor(candles.length * 0.15));
    const endIndex = candles.length - lookForward;

    const profile = getProfileConfig(config);
    const TRADE_THRESHOLD = profile.tradeThreshold;
    const requireCrossover = config?.requireCrossover ?? profile.requireCrossover;

    let lastSignalBar = -999;
    let lastSignalType: 'BUY' | 'SELL' | null = null;

    // Resolve ga-optimizer constants to avoid direct cyclic dependency at runtime where possible
    const minSignalThreshold = 20; // Hardcoded fallback or imported value

    for (let i = startIndex; i < endIndex; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + lookForward].close;
        let signal: "BUY" | "SELL" | null = null;

        const regime = classifyRegime(candles, i, atrValues);
        regimeData[i] = { regime };

        const cd = getDynamicCooldown(atrValues, i, interval, config);
        const cooldownOk = (i - lastSignalBar) >= cd;
        let sellBypass = false;

        if (strategyName === 'RSI_CCI_WT') {
            const rsiConf = allData.rsiData?.confidence?.[i];
            const w1Conf = allData.waveTrendData?.wt1Confidence?.[i];
            const w2Conf = allData.waveTrendData?.wt2Confidence?.[i];

            const rsiVal = allData.rsiData?.rsi[i]?.value;
            const rsiMa = allData.rsiData?.ma[i]?.value;
            const cciVal = allData.cciData?.cci[i]?.value;
            const cciMa = allData.cciData?.ma[i]?.value;

            const rsiOk = rsiConf !== 0 && rsiVal !== undefined && rsiMa !== undefined;
            const cciOk = cciVal !== undefined && cciMa !== undefined;
            const wt1 = allData.waveTrendData?.wt1[i]?.value;
            const wt2 = allData.waveTrendData?.wt2[i]?.value;
            const wtOk = w1Conf !== 0 && w2Conf !== 0 && wt1 !== undefined && wt2 !== undefined;

            if (rsiOk && cciOk) {
                const rsiSig = rsiSignal(rsiVal!, rsiMa!);
                const cciSig = cciSignal(cciVal!, cciMa!);
                let wtSig: "BUY" | "SELL" | null = null;

                if (wtOk) {
                    wtSig = waveTrendSignal(wt1!, wt2!);
                }

                const totalVoters = wtOk ? 3 : 2;
                const buyVotes = (rsiSig === 'BUY' ? 1 : 0) + (cciSig === 'BUY' ? 1 : 0) + (wtSig === 'BUY' ? 1 : 0);
                const sellVotes = (rsiSig === 'SELL' ? 1 : 0) + (cciSig === 'SELL' ? 1 : 0) + (wtSig === 'SELL' ? 1 : 0);
                const allAgree = buyVotes === totalVoters || sellVotes === totalVoters;

                const anyFreshCross = requireCrossover
                    ? hasFreshCrossover('rsi', i, allData) ||
                    hasFreshCrossover('cci', i, allData) ||
                    (wtOk && hasFreshCrossover('wavetrend', i, allData))
                    : true;

                if (allAgree && anyFreshCross) {
                    signal = buyVotes === totalVoters ? 'BUY' : 'SELL';
                }
            }
        }
        else if (isCustom) {
            const inds = options.customIndicators!;
            const bbas: BBA[] = [];
            let anyFreshCross = false;

            const kaufmanER = efficiencyRatio(candles, i, 10);

            for (const key of inds) {
                const sig = getIndicatorSignal(key, i, allData, candles);
                if (sig === null) continue;

                const baseConfidence = options.indicatorConfidences?.[key] ?? 0.6;
                const confidence = baseConfidence * (0.3 + 0.7 * kaufmanER);
                bbas.push(signalToBBA(sig, confidence, regime));

                if (requireCrossover && !anyFreshCross && hasFreshCrossover(key, i, allData, candles)) {
                    anyFreshCross = true;
                }
            }

            const crossoverPass = requireCrossover ? anyFreshCross : true;

            if (bbas.length >= 2 && crossoverPass) {
                const fused = fuseAll(bbas);

                if (fused.buy > TRADE_THRESHOLD && fused.buy > fused.sell) {
                    signal = 'BUY';
                } else if (fused.sell > TRADE_THRESHOLD && fused.sell > fused.buy) {
                    signal = 'SELL';
                }
            }
        }

        if (config.debugLog) {
            const indicatorSignals: IndicatorLogEntry[] = [];

            if (strategyName === 'RSI_CCI_WT') {
                const rsiVal = allData.rsiData?.rsi[i]?.value;
                const rsiMa = allData.rsiData?.ma[i]?.value;
                const cciVal = allData.cciData?.cci[i]?.value;
                const cciMa = allData.cciData?.ma[i]?.value;

                if (rsiVal !== undefined && rsiMa !== undefined) {
                    const rsiSig = rsiSignal(rsiVal, rsiMa);
                    indicatorSignals.push({
                        key: 'rsi',
                        signal: rsiSig,
                        bba: signalToBBA(rsiSig, 0.6, regime),
                        freshCrossover: hasFreshCrossover('rsi', i, allData),
                        regime,
                    });
                }
                if (cciVal !== undefined && cciMa !== undefined) {
                    const cciSig = cciSignal(cciVal, cciMa);
                    indicatorSignals.push({
                        key: 'cci',
                        signal: cciSig,
                        bba: signalToBBA(cciSig, 0.6, regime),
                        freshCrossover: hasFreshCrossover('cci', i, allData),
                        regime,
                    });
                }
                if (allData.waveTrendData) {
                    const wt1 = allData.waveTrendData.wt1[i]?.value;
                    const wt2 = allData.waveTrendData.wt2[i]?.value;
                    if (wt1 !== undefined && wt2 !== undefined) {
                        const wtSig = waveTrendSignal(wt1, wt2);
                        indicatorSignals.push({
                            key: 'wavetrend',
                            signal: wtSig,
                            bba: signalToBBA(wtSig, 0.6, regime),
                            freshCrossover: hasFreshCrossover('wavetrend', i, allData),
                            regime,
                        });
                    }
                }
            } else if (isCustom) {
                const inds = options.customIndicators!;
                for (const key of inds) {
                    const sig = getIndicatorSignal(key, i, allData, candles);
                    if (sig === null) continue;
                    indicatorSignals.push({
                        key,
                        signal: sig,
                        bba: signalToBBA(sig, 0.6, regime),
                        freshCrossover: hasFreshCrossover(key, i, allData, candles),
                        regime,
                    });
                }
            }

            let rejectionReason: string | undefined;
            if (!signal) {
                const parts: string[] = [];
                if (requireCrossover) {
                    const anyFreshCross = indicatorSignals.some(s => s.freshCrossover);
                    if (!anyFreshCross) parts.push('No fresh crossover');
                }
                if (!cooldownOk) parts.push(`Cooldown active (${i - lastSignalBar}/${cd})`);
                if (indicatorSignals.length < 2) parts.push(`Only ${indicatorSignals.length} indicator(s) active`);
                rejectionReason = parts.length > 0 ? parts.join('; ') : 'Signal threshold not met';
            }

            debugLog.push({
                barIndex: i,
                date: candles[i].time,
                price: currentPrice,
                indicatorSignals,
                gates: {
                    freshCrossoverOk: requireCrossover ? indicatorSignals.some(s => s.freshCrossover) : true,
                    cooldownOk,
                    cooldownValue: cd,
                    thresholdOk: signal !== null,
                    maskOk: !config.signalMask || !!config.signalMask[i],
                },
                decision: signal,
                rejectionReason,
                ...(signal ? {
                    tradeOutcome: {
                        futurePrice,
                        rawReturn: (futurePrice - currentPrice) / currentPrice,
                        isWin: (signal === 'BUY' ? 1 : -1) * (futurePrice - currentPrice) / currentPrice > 0,
                    },
                } : {}),
            });
        }

        if (signal) {
            sellBypass = !cooldownOk && signal === 'SELL' && lastSignalType === 'BUY';

            if (config.signalMask && !config.signalMask[i]) continue;

            if (!cooldownOk && !sellBypass) continue;

            totalSignals++;
            lastSignalBar = i;
            lastSignalType = signal;

            let tradeReturn: number;
            let isWin: boolean;
            let tradeMfe: number | undefined;
            let tradeMae: number | undefined;
            let tradeIntraDD: number | undefined;
            let tradeExitReason: string | undefined;
            let tradeBarsHeld: number | undefined;
            let effectiveFuturePrice = futurePrice;
            const profileCfg = getProfileConfig(config);
            const tcPct = (profileCfg.transactionCostPct ?? 0) / 100;

            const evalMode = config.evaluationMode ?? 'pathaware';

            if (evalMode === 'pathaware' || evalMode === 'regime') {
                const tradeRiskCfg: TradeRiskConfig = config.riskConfig ?? {
                    stopLossAtrMult: profileCfg.stopLossAtrMult,
                    takeProfitR: profileCfg.takeProfitR,
                    useTrailingStop: profileCfg.useTrailingStop,
                    trailAtrMult: profileCfg.trailAtrMult,
                    timeStopBars: 30,
                };
                const simResult = simulateTrade(candles, i, signal, atrValues, tradeRiskCfg);
                tradeReturn = simResult.realizedReturnPct / 100 - tcPct;
                isWin = tradeReturn > 0;
                tradeMfe = simResult.mfe;
                tradeMae = simResult.mae;
                tradeIntraDD = simResult.intraTradeMaxDD;
                tradeExitReason = simResult.exitReason;
                tradeBarsHeld = simResult.barsHeld;
                effectiveFuturePrice = simResult.exitPrice;
            } else {
                const rawReturn = (futurePrice - currentPrice) / currentPrice;
                tradeReturn = (signal === 'BUY' ? rawReturn : -rawReturn) - tcPct;
                isWin = tradeReturn > 0;
            }

            if (isWin) wins++;

            totalReturnPct += tradeReturn;
            if (tradeReturn > 0) {
                grossProfit += tradeReturn;
                winningSum += tradeReturn;
                winningCount++;
            } else {
                grossLoss += Math.abs(tradeReturn);
                losingSum += Math.abs(tradeReturn);
                losingCount++;
            }
            tradeReturns.push(tradeReturn);

            regimeWins[regime] += isWin ? 1 : 0;
            regimeSignals[regime] = (regimeSignals[regime] || 0) + 1;
            regimeReturnSums[regime] = (regimeReturnSums[regime] || 0) + tradeReturn;

            if (totalReturnPct > peakEquity) {
                peakEquity = totalReturnPct;
            }
            const dd = peakEquity - totalReturnPct;
            if (dd > maxDrawdown) maxDrawdown = dd;

            history.push({
                time: candles[i].time,
                signal,
                price: currentPrice,
                futurePrice: effectiveFuturePrice,
                isWin,
                mfe: tradeMfe,
                mae: tradeMae,
                intraTradeDD: tradeIntraDD,
                exitReason: tradeExitReason,
                barsHeld: tradeBarsHeld,
                realizedReturn: (evalMode !== 'lookforward') ? tradeReturn * 100 : undefined,
            });
        }
    }

    const winRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    let sharpeRatio = 0;
    let tradeMean = 0;
    if (tradeReturns.length >= 2) {
        let mean = 0, m2 = 0;
        for (let t = 0; t < tradeReturns.length; t++) {
            const x = tradeReturns[t];
            const delta = x - mean;
            mean += delta / (t + 1);
            m2 += delta * (x - mean);
        }
        tradeMean = mean;
        const variance = m2 / (tradeReturns.length - 1);
        const std = Math.sqrt(Math.max(variance, 1e-10));
        sharpeRatio = (mean / std) * Math.sqrt(252);
    }

    const avgWin = winningCount > 0 ? winningSum / winningCount : 0;
    const avgLoss = losingCount > 0 ? losingSum / losingCount : 0;

    const allRegimes: MarketRegime[] = ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'];
    const regimeBreakdown = {} as Record<MarketRegime, RegimeStats>;
    for (const r of allRegimes) {
        const sigs = regimeSignals[r] || 0;
        const w = regimeWins[r] || 0;
        const retSum = regimeReturnSums[r] || 0;
        regimeBreakdown[r] = {
            winRate: sigs > 0 ? (w / sigs) * 100 : 0,
            totalSignals: sigs,
            wins: w,
            avgReturn: sigs > 0 ? retSum / sigs : 0,
            totalReturn: retSum,
        };
    }

    const evalModeForMetrics = config.evaluationMode ?? 'pathaware';
    let avgMFE: number | undefined;
    let avgMAE: number | undefined;
    let avgBarsHeld: number | undefined;
    let exitReasonBreakdown: Record<string, number> | undefined;

    if (evalModeForMetrics !== 'lookforward' && totalSignals > 0) {
        let sumMFE = 0, sumMAE = 0, sumBars = 0;
        const exitCounts: Record<string, number> = {};
        for (const h of history) {
            if (h.mfe !== undefined) sumMFE += h.mfe;
            if (h.mae !== undefined) sumMAE += h.mae;
            if (h.barsHeld !== undefined) sumBars += h.barsHeld;
            if (h.exitReason) {
                exitCounts[h.exitReason] = (exitCounts[h.exitReason] || 0) + 1;
            }
        }
        avgMFE = sumMFE / totalSignals;
        avgMAE = sumMAE / totalSignals;
        avgBarsHeld = sumBars / totalSignals;
        exitReasonBreakdown = exitCounts;
    }

    let portfolioResult: PortfolioSimResult | undefined;
    let equityCurve: { time: string | number; equity: number }[] | undefined;
    let drawdownCurve: { time: string | number; drawdownPct: number }[] | undefined;
    let finalEquity: number | undefined;
    let cagr: number | undefined;
    let maxDrawdownPct: number | undefined;

    if (evalModeForMetrics !== 'lookforward' && config.portfolioConfig) {
        const portfolioSignals: PortfolioSignalEntry[] = history
            .filter((h) => h.exitReason !== undefined && h.realizedReturn !== undefined)
            .map((h) => {
                const entryIndex = candles.findIndex((c) => c.time === h.time);
                return {
                    barIndex: entryIndex !== -1 ? entryIndex : 0,
                    signal: h.signal,
                    simulatedTrade: {
                        entryIndex: entryIndex !== -1 ? entryIndex : 0,
                        exitIndex: (entryIndex !== -1 && h.barsHeld !== undefined) ? entryIndex + h.barsHeld : 0,
                        exitReason: h.exitReason as any,
                        entryPrice: h.price,
                        exitPrice: h.futurePrice,
                        realizedReturnPct: h.realizedReturn!,
                        mfe: h.mfe ?? 0,
                        mae: h.mae ?? 0,
                        intraTradeMaxDD: h.intraTradeDD ?? 0,
                        barsHeld: h.barsHeld ?? 0,
                    }
                };
            })
            .filter((entry) => entry.barIndex !== -1);

        const { runPortfolioSimulation, resampleCurve } = require('../simulation/portfolio-simulator');

        portfolioResult = runPortfolioSimulation(candles, portfolioSignals, config.portfolioConfig);
        
        if (portfolioResult) {
            equityCurve = resampleCurve(portfolioResult.equityCurve, 200);
            drawdownCurve = resampleCurve(portfolioResult.drawdownCurve, 200);
            finalEquity = portfolioResult.finalEquity;
            cagr = portfolioResult.cagr;
            maxDrawdownPct = portfolioResult.maxDrawdownPct;
        }
    }

    const psr = tradeReturns.length >= 3
        ? computePSR(tradeMean, 0, totalSignals, tradeReturns)
        : undefined;

    let averageReturnPerBar: number | undefined;
    let opportunityEfficiency: number | undefined;
    if (evalModeForMetrics !== 'lookforward' && totalSignals > 0) {
        let sumReturnPerBar = 0;
        let sumOE = 0;
        let oeCount = 0;
        for (const h of history) {
            if (h.realizedReturn !== undefined && h.barsHeld !== undefined && h.barsHeld > 0) {
                sumReturnPerBar += Math.abs(h.realizedReturn) / h.barsHeld;
            }
            if (h.realizedReturn !== undefined && h.mfe !== undefined && h.mfe > 0.01) {
                sumOE += Math.abs(h.realizedReturn) / h.mfe;
                oeCount++;
            }
        }
        averageReturnPerBar = sumReturnPerBar / totalSignals;
        opportunityEfficiency = oeCount > 0 ? sumOE / oeCount : undefined;
    }

    return {
        winRate,
        totalSignals,
        wins,
        history,
        profitFactor,
        sharpeRatio,
        avgWin,
        avgLoss,
        maxDrawdown,
        totalReturn: totalReturnPct,
        regimeBreakdown,
        log: config.debugLog ? debugLog : undefined,
        evaluationMode: evalModeForMetrics,
        avgMFE,
        avgMAE,
        avgBarsHeld,
        exitReasonBreakdown,
        portfolioResult,
        equityCurve,
        drawdownCurve,
        finalEquity,
        cagr,
        maxDrawdownPct,
        psr,
        averageReturnPerBar,
        opportunityEfficiency,
    };
}
