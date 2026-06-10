// lib/ta/indicator-evaluator.ts — Per-Indicator Per-Regime Performance Evaluator
//
// Computes historical hit-rates for each indicator × regime combination.
// For each regime segment, checks which indicators generated correct directional
// signals BEFORE the segment began (causal check — no look-ahead bias).
//
// Statistics:
//   - Beta-Binomial posterior credible intervals via getBetaPosterior
//   - Min-sample gate (≥30 regime starts required for statistical significance)
//   - Average bars-before metric (how early does the indicator signal?)
//
// IMPORTANT: Signal logic uses the CANONICAL *Signal() functions from
// signal-registry.ts (via getIndicatorSignal in strategy-optimizer.ts).
// This ensures telemetry hit rates are measured with the SAME rules
// the strategy engine uses. Never add custom signal logic here.

import type { Candle } from '@/lib/ta/simulation/backtest';
import type { MarketRegime } from '@/lib/ta/types';
import type { RegimeSegment } from '@/lib/ta/regime-detector';
import type { AllData } from '@/lib/ta/strategy-optimizer/types';
import { getBetaPosterior } from '@/lib/ta/strategy-optimizer';
import {
    rsiSignal, cciSignal, waveTrendSignal, macdSignal,
    stochRsiSignal, dmiSignal, smiSignal, aoSignal,
    mfiSignal, wprSignal, diSignal, cmfSignal, adSignal,
    netvolSignal, madrSignal, almaSignal, bbSignal,
    type BBPoint,
} from '@/lib/ta/registry/signal-registry';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Per-indicator per-regime performance statistics with uncertainty quantification. */
export interface IndicatorRegimePerformance {
    /** Indicator key (e.g., 'rsi', 'cci', 'wavetrend') */
    indicator: string;
    /** The market regime being evaluated */
    regime: MarketRegime;
    /** Historical hit rate — fraction of regime starts where the indicator gave correct direction */
    hitRate: number;
    /** Beta-Binomial 95% credible interval [lower, upper] */
    hitRateCI: [number, number];
    /** Number of regime segment starts evaluated */
    sampleSize: number;
    /** Whether sampleSize meets the minimum threshold for statistical reliability */
    sufficientSample: boolean;
    /** Average number of bars the signal preceded the regime start (causal lead time) */
    avgBarsBefore: number;
}

/** Configuration for the indicator evaluator. */
export interface EvaluatorConfig {
    /** How many bars before the regime start to check for signals (default: 7) */
    lookbackBars: number;
    /** Minimum number of regime starts required for reliable statistics (default: 30) */
    minSampleSize: number;
    /** Confidence level for Beta-Binomial intervals (default: 0.95) */
    confidenceLevel: number;
}

/** Default evaluator configuration. */
export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
    lookbackBars: 7,
    minSampleSize: 30,
    confidenceLevel: 0.95,
};

// ─── Canonical Signal Access (uses signal-registry.ts functions) ─────────────

/** All indicator keys evaluated by telemetry. */
const INDICATOR_KEYS = [
    'rsi', 'cci', 'wavetrend', 'macd', 'stochrsi', 'dmi',
    'smi', 'ao', 'mfi', 'wpr', 'di', 'cmf', 'ad',
    'netvol', 'madr', 'alma', 'bb',
] as const;

/**
 * Get a directional signal from an indicator at bar index i.
 *
 * Uses the CANONICAL *Signal() functions from signal-registry.ts —
 * the same functions used by runStrategyBacktest(). This guarantees
 * telemetry hit rates are measured with identical rules.
 *
 * Mirrors getIndicatorSignal() in strategy-optimizer.ts.
 */
function getIndicatorDirection(
    key: string,
    i: number,
    allData: AllData,
    candles: Candle[],
): 'BUY' | 'SELL' | null {
    if (i < 1) return null;

    switch (key) {
        case 'rsi': {
            if (!allData.rsiData) return null;
            if (allData.rsiData.confidence && allData.rsiData.confidence[i] === 0) return null;
            const rsi = allData.rsiData.rsi[i]?.value;
            const rsiMa = allData.rsiData.ma[i]?.value;
            if (rsi === undefined || rsiMa === undefined) return null;
            return rsiSignal(rsi, rsiMa);
        }
        case 'cci': {
            if (!allData.cciData) return null;
            const cci = allData.cciData.cci[i]?.value;
            const ma = allData.cciData.ma[i]?.value;
            if (cci === undefined || ma === undefined) return null;
            return cciSignal(cci, ma);
        }
        case 'wavetrend': {
            if (!allData.waveTrendData) return null;
            const w1Conf = allData.waveTrendData.wt1Confidence?.[i];
            const w2Conf = allData.waveTrendData.wt2Confidence?.[i];
            if (w1Conf === 0 || w2Conf === 0) return null;
            const wt1 = allData.waveTrendData.wt1[i]?.value;
            const wt2 = allData.waveTrendData.wt2[i]?.value;
            if (wt1 === undefined || wt2 === undefined) return null;
            return waveTrendSignal(wt1, wt2);
        }
        case 'macd': {
            if (!allData.macdData) return null;
            const macd = allData.macdData.macd[i]?.value;
            const signal = allData.macdData.signal[i]?.value;
            if (macd === undefined || signal === undefined) return null;
            return macdSignal(macd, signal);
        }
        case 'stochrsi': {
            if (!allData.stochRsiData) return null;
            const k = allData.stochRsiData.k[i]?.value;
            const d = allData.stochRsiData.d[i]?.value;
            if (k === undefined || d === undefined) return null;
            return stochRsiSignal(k, d);
        }
        case 'dmi': {
            if (!allData.dmiData) return null;
            const plus = allData.dmiData.plusDI[i]?.value;
            const minus = allData.dmiData.minusDI[i]?.value;
            if (plus === undefined || minus === undefined) return null;
            return dmiSignal(plus, minus);
        }
        case 'smi': {
            if (!allData.smiData) return null;
            const smi = allData.smiData.smi[i]?.value;
            const signal = allData.smiData.signal[i]?.value;
            if (smi === undefined || signal === undefined) return null;
            return smiSignal(smi, signal);
        }
        case 'ao': {
            const arr = allData.aoData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return aoSignal(cur, prev);
        }
        case 'mfi': {
            const arr = allData.mfiData?.mfi ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return mfiSignal(cur, prev);
        }
        case 'wpr': {
            const arr = allData.wprData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return wprSignal(cur, prev);
        }
        case 'di': {
            const arr = allData.diData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return diSignal(cur);
        }
        case 'cmf': {
            const arr = allData.cmfData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return cmfSignal(cur);
        }
        case 'ad': {
            const adObj = allData.adData;
            if (!adObj) return null;
            const cur = adObj.ad[i]?.value;
            const curSma = adObj.ma[i]?.value;
            if (cur === undefined || curSma === undefined) return null;
            return adSignal(cur, curSma);
        }
        case 'netvol': {
            const arr = allData.nvData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return netvolSignal(cur);
        }
        case 'madr': {
            const arr = allData.madrData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return madrSignal(cur);
        }
        case 'alma': {
            const arr = allData.almaData ?? [];
            const curA = arr[i]?.value;
            const prevA = arr[i - 1]?.value;
            const curC = candles[i]?.close;
            const prevC = candles[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return null;
            return almaSignal(curA, prevA, curC, prevC);
        }
        case 'bb': {
            const arr = allData.bbData ?? [];
            const curBB = arr[i];
            const prevBB = arr[i - 1];
            const curC = candles[i]?.close;
            const prevC = candles[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return null;
            if (curBB.lower === undefined || prevBB.lower === undefined || curBB.upper === undefined || prevBB.upper === undefined) return null;
            return bbSignal(curBB as unknown as BBPoint, prevBB as unknown as BBPoint, curC, prevC);
        }
        default:
            return null;
    }
}

// ─── Core Evaluation Function ────────────────────────────────────────────────

/**
 * Evaluate per-indicator per-regime historical hit-rates.
 *
 * For each regime segment, looks back `lookbackBars` from the segment start
 * and checks whether each indicator generated a correct directional signal.
 *
 * A "correct" signal means:
 *   - BUY signal before an uptrend segment → hit
 *   - SELL signal before a downtrend segment → hit
 *   - For 'ranging'/'volatile' regimes, neutral is expected (no buy/sell)
 *
 * Uses Beta-Binomial credible intervals for uncertainty quantification.
 * Reports hit rates only when sampleSize >= minSampleSize (sufficientSample = true).
 *
 * @param candles - Full candle array
 * @param allData - Pre-computed indicator data (AllData structure)
 * @param segments - Regime segments from segmentRegimes() or buildCausalSegments()
 * @param config - Evaluation parameters
 * @returns Array of indicator-regime performance statistics
 */
export function evaluateIndicators(
    candles: Candle[],
    allData: AllData,
    segments: RegimeSegment[],
    config: EvaluatorConfig = DEFAULT_EVALUATOR_CONFIG,
): IndicatorRegimePerformance[] {
    const { lookbackBars, minSampleSize, confidenceLevel } = config;

    if (segments.length === 0) {
        return [];
    }

    // ── Initialize accumulator per indicator × regime ──
    const accumulator: Record<string, Record<string, {
        hits: number;
        misses: number;
        totalBarsBefore: number;
        signalCount: number;
    }>> = {};

    for (const key of INDICATOR_KEYS) {
        accumulator[key] = {
            uptrend: { hits: 0, misses: 0, totalBarsBefore: 0, signalCount: 0 },
            downtrend: { hits: 0, misses: 0, totalBarsBefore: 0, signalCount: 0 },
            ranging: { hits: 0, misses: 0, totalBarsBefore: 0, signalCount: 0 },
            volatile: { hits: 0, misses: 0, totalBarsBefore: 0, signalCount: 0 },
            neutral: { hits: 0, misses: 0, totalBarsBefore: 0, signalCount: 0 },
        };
    }

    // ── Evaluate each segment ──
    for (const seg of segments) {
        // Determine expected direction for this regime
        const expectedDir: 'BUY' | 'SELL' | null =
            seg.type === 'uptrend' ? 'BUY'
            : seg.type === 'downtrend' ? 'SELL'
            : null; // ranging/volatile/neutral → no clear directional expectation

        // Lookback window: bars before segment start
        const lookbackStart = Math.max(0, seg.startIndex - lookbackBars);
        const lookbackEnd = Math.max(0, seg.startIndex - 1);

        if (lookbackEnd <= lookbackStart) continue; // Not enough bars

        for (const key of INDICATOR_KEYS) {
            const acc = accumulator[key][seg.type];
            let foundSignal = false;
            let barsBefore = 0;

            // Scan backwards from segment start for the LAST signal
            for (let j = lookbackEnd; j >= lookbackStart; j--) {
                const dir = getIndicatorDirection(key, j, allData, candles);
                if (dir === null) continue;

                // Record the signal and its distance to segment start
                if (!foundSignal) {
                    foundSignal = true;
                    barsBefore = seg.startIndex - j;

                    if (expectedDir !== null) {
                        // Directional regime: expect specific direction
                        if (dir === expectedDir) {
                            acc.hits++;
                        } else {
                            acc.misses++;
                        }
                    } else {
                        // Non-directional regime (ranging/volatile/neutral):
                        // ANY signal is considered a "miss" — we expect no signal
                        acc.misses++;
                    }
                }
            }

            // No signal found in lookback window
            if (!foundSignal) {
                if (expectedDir !== null) {
                    // Directional regime: no signal = miss (failed to predict)
                    acc.misses++;
                } else {
                    // Non-directional regime: no signal = hit (correctly stayed out)
                    acc.hits++;
                }
            } else {
                acc.totalBarsBefore += barsBefore;
                acc.signalCount++;
            }
        }
    }

    // ── Build result array with statistical estimates ──
    const results: IndicatorRegimePerformance[] = [];
    const allRegimes: MarketRegime[] = ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'];

    for (const key of INDICATOR_KEYS) {
        for (const regime of allRegimes) {
            const acc = accumulator[key][regime];
            const sampleSize = acc.hits + acc.misses;

            // Compute Beta-Binomial posterior hit rate
            const hitRate = sampleSize > 0
                ? getBetaPosterior(acc.hits, acc.misses)
                : 0;

            // Compute 95% credible interval (approximate using Normal approximation to Beta)
            const alpha = 1 + acc.hits;
            const beta = 1 + acc.misses;
            const posteriorMean = alpha / (alpha + beta);

            // Safety: for very small samples, rely on prior (Beta(1,1) → mean=0.5)
            // rather than producing unstable estimates. Beta-Binomial gracefully
            // handles low sample sizes via shrinkage toward the uniform prior.
            const posteriorVar = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
            const posteriorStd = Math.sqrt(Math.max(posteriorVar, 0)); // guard against floating-point underflow

            // Wald-type CI on logit scale for better boundary behaviour, then back-transform
            // Using Normal approximation for simplicity (valid for moderate-to-large samples)
            const z = confidenceLevel === 0.95 ? 1.96 : 1.645; // 95% or 90% CI
            const lower = Math.max(0, posteriorMean - z * posteriorStd);
            const upper = Math.min(1, posteriorMean + z * posteriorStd);

            const avgBarsBefore = acc.signalCount > 0
                ? acc.totalBarsBefore / acc.signalCount
                : 0;

            results.push({
                indicator: key,
                regime,
                hitRate: Math.round(hitRate * 10000) / 10000,
                hitRateCI: [
                    Math.round(lower * 10000) / 10000,
                    Math.round(upper * 10000) / 10000,
                ],
                sampleSize,
                sufficientSample: sampleSize >= minSampleSize,
                avgBarsBefore: Math.round(avgBarsBefore * 10) / 10,
            });
        }
    }

    return results;
}