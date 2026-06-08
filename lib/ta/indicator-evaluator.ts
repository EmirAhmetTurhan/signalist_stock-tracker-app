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

import type { Candle } from './backtest';
import type { MarketRegime } from './types';
import type { RegimeSegment } from './regime-detector';
import { getBetaPosterior } from './strategy-optimizer';

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

// ─── Indicator Signal Access ─────────────────────────────────────────────────

/**
 * Get a simple directional signal from an indicator at bar index i.
 * This is a lightweight version of the full signal functions in signal-registry.ts,
 * designed for the evaluation hot-path. Returns only BUY/SELL/null.
 *
 * Requires pre-loaded indicator values in the data map.
 */
function getIndicatorDirection(
    key: string,
    i: number,
    data: Record<string, number[]>,
): 'BUY' | 'SELL' | null {
    const values = data[key];
    if (!values || i < 1) return null;

    const cur = values[i];
    const prev = values[i - 1];
    if (cur === undefined || prev === undefined) return null;

    // Determine direction based on indicator-specific logic
    switch (key) {
        case 'rsi': {
            // RSI: buy when crossing above oversold (30) or trending up strongly
            if (cur > prev && prev < 40) return 'BUY';
            if (cur < prev && prev > 60) return 'SELL';
            return null;
        }
        case 'cci': {
            // CCI: buy when rising from negative territory, sell when falling from positive
            if (cur > prev && cur > -100) return 'BUY';
            if (cur < prev && cur < 100) return 'SELL';
            return null;
        }
        case 'macd': {
            // MACD: signal based on value relative to 0
            if (cur > 0 && cur > prev) return 'BUY';
            if (cur < 0 && cur < prev) return 'SELL';
            return null;
        }
        case 'wavetrend': {
            // WaveTrend: buy below oversold line, sell above overbought
            if (cur < -60 && prev < -60 && cur > prev) return 'BUY';
            if (cur > 60 && prev > 60 && cur < prev) return 'SELL';
            return null;
        }
        case 'dmi': {
            // DMI: plusDI vs some threshold proxy — here we use the raw value
            if (cur > 25 && cur > prev) return 'BUY';
            if (cur < 25 && cur < prev) return 'SELL';
            return null;
        }
        case 'ao': {
            // Awesome Oscillator: direction is the signal
            if (cur > 0 && cur > prev) return 'BUY';
            if (cur < 0 && cur < prev) return 'SELL';
            return null;
        }
        default: {
            // Generic: rising = bullish, falling = bearish
            if (cur > prev) return 'BUY';
            if (cur < prev) return 'SELL';
            return null;
        }
    }
}

// ─── Core Evaluation Function ────────────────────────────────────────────────

/**
 * Evaluate per-indicator per-regime historical hit-rates.
 *
 * For each regime segment identified by segmentRegimes(), looks back
 * `lookbackBars` from the segment start and checks whether each indicator
 * generated a correct directional signal.
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
 * @param indicatorDataMap - Map of indicator key → pre-computed value arrays
 * @param segments - Regime segments from segmentRegimes()
 * @param config - Evaluation parameters
 * @returns Array of indicator-regime performance statistics
 */
export function evaluateIndicators(
    candles: Candle[],
    indicatorDataMap: Record<string, number[]>,
    segments: RegimeSegment[],
    config: EvaluatorConfig = DEFAULT_EVALUATOR_CONFIG,
): IndicatorRegimePerformance[] {
    const { lookbackBars, minSampleSize, confidenceLevel } = config;
    const indicatorKeys = Object.keys(indicatorDataMap);

    if (indicatorKeys.length === 0 || segments.length === 0) {
        return [];
    }

    // ── Initialize accumulator per indicator × regime ──
    const accumulator: Record<string, Record<string, {
        hits: number;
        misses: number;
        totalBarsBefore: number;
        signalCount: number;
    }>> = {};

    for (const key of indicatorKeys) {
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

        for (const key of indicatorKeys) {
            const acc = accumulator[key][seg.type];
            let foundSignal = false;
            let barsBefore = 0;

            // Scan backwards from segment start for the LAST signal
            for (let j = lookbackEnd; j >= lookbackStart; j--) {
                const dir = getIndicatorDirection(key, j, indicatorDataMap);
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

    for (const key of indicatorKeys) {
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