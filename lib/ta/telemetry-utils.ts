// lib/ta/telemetry-utils.ts — Shared Telemetry Utilities
//
// Extracted from app/api/analysis/market-telemetry/route.ts so both
// the API route and the Inngest discovery pipeline can reuse the same
// telemetry computation without duplicating code.
//
// Exports:
//   - buildCausalSegments()  — causal regime segmentation using classifyRegime()
//   - computeTelemetryConfidences() — chains: segments → evaluateIndicators → weighted average
//     Returns Record<string, number> of per-indicator confidence scores for DST fusion.

import type { Candle } from '@/lib/ta/simulation/backtest';
import type { AllData } from '@/lib/ta/strategy-optimizer/types';
import type { RegimeSegment } from '@/lib/ta/regime-detector';
import { classifyRegime } from '@/lib/ta/regime-detector';
import { evaluateIndicators, type EvaluatorConfig, DEFAULT_EVALUATOR_CONFIG } from '@/lib/ta/indicator-evaluator';

// ─── Causal Regime Segmentation ──────────────────────────────────────────────

/**
 * Build causal regime segments using classifyRegime() instead of
 * the non-causal segmentRegimes() zigzag algorithm.
 *
 * classifyRegime() only reads past bars → safe for live signal use.
 * Consecutive bars with the same regime are grouped into segments.
 */
export function buildCausalSegments(candles: Candle[]): RegimeSegment[] {
    if (candles.length < 30) return [];

    // Compute ATR once for all bars
    const atr: number[] = [];
    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        if (i < 14) { sumTR += tr; atr.push(sumTR / (i + 1)); }
        else if (i === 14) { sumTR += tr; atr.push(sumTR / 14); }
        else { atr.push((atr[i - 1] * 13 + tr) / 14); }
    }

    const segments: RegimeSegment[] = [];
    let segStart = 30; // Skip warmup
    let currentRegime = classifyRegime(candles, segStart, atr);

    for (let i = 31; i < candles.length; i++) {
        const regime = classifyRegime(candles, i, atr);
        if (regime !== currentRegime || i === candles.length - 1) {
            const endIdx = i === candles.length - 1 ? i : i - 1;
            if (endIdx - segStart >= 3) { // Min 3 bars per segment
                const startPrice = candles[segStart].close;
                const endPrice = candles[endIdx].close;
                const priceChangePct = ((endPrice - startPrice) / startPrice) * 100;
                segments.push({
                    startIndex: segStart,
                    endIndex: endIdx,
                    startDate: candles[segStart].time,
                    endDate: candles[endIdx].time,
                    type: currentRegime,
                    priceChange: priceChangePct,
                    priceChangePct,
                    durationBars: endIdx - segStart + 1,
                    confidence: 0.7,
                    startPrice,
                    endPrice,
                });
            }
            segStart = i;
            currentRegime = regime;
        }
    }

    return segments;
}

// ─── Telemetry → DST Confidence Bridge ───────────────────────────────────────

/**
 * Configuration for computeTelemetryConfidences().
 */
export interface TelemetryConfidenceOptions {
    /** Evaluator config for hit rate computation. */
    evaluatorConfig?: Partial<EvaluatorConfig>;
    /**
     * Minimum confidence floor (prevents any indicator from reaching 0).
     * Default: 0.3 — even the worst indicator gets 30% base confidence.
     */
    minConfidence?: number;
    /**
     * Maximum confidence ceiling.
     * Default: 0.9 — prevents overconfidence from small samples.
     */
    maxConfidence?: number;
}

/**
 * Compute per-indicator confidence scores from Market Telemetry data.
 *
 * This is the bridge between Market Telemetry and DST fusion:
 *   evaluateIndicators(candles, allData, segments)
 *     → IndicatorRegimePerformance[]
 *     → for each indicator: weighted average of hit rates across regimes
 *     → Record<string, number>  // e.g. { rsi: 0.72, macd: 0.58, mfi: 0.41, ... }
 *     → passed to runStrategyBacktest(..., { indicatorConfidences })
 *
 * The weighting is by regime duration (bars) so that dominant market regimes
 * contribute more to the final confidence score.
 *
 * @param candles - Full candle array
 * @param allData - Pre-computed indicator data (AllData structure)
 * @param options - Configuration options
 * @returns Record mapping indicator keys to confidence scores (0.3–0.9)
 */
export function computeTelemetryConfidences(
    candles: Candle[],
    allData: AllData,
    options: TelemetryConfidenceOptions = {},
): Record<string, number> {
    const minConfidence = options.minConfidence ?? 0.3;
    const maxConfidence = options.maxConfidence ?? 0.9;
    const evaluatorConfig: EvaluatorConfig = {
        ...DEFAULT_EVALUATOR_CONFIG,
        // Causal segments are typically shorter than non-causal zigzag segments.
        // Lower minSampleSize to 10 so we get meaningful stats even with fewer segments.
        // Beta-Binomial posterior (Beta(1,1) prior) gracefully handles small samples
        // by shrinking toward 0.5.
        minSampleSize: 10,
        ...options.evaluatorConfig,
    };

    // 1. Build causal segments
    const segments = buildCausalSegments(candles);

    if (segments.length === 0) {
        // No segments → return default confidence (0.6) for all indicators
        return {};
    }

    // 2. Evaluate indicators per regime
    const performances = evaluateIndicators(candles, allData, segments, evaluatorConfig);

    if (performances.length === 0) {
        return {};
    }

    // 3. Compute regime duration weights (how many bars each regime accounts for)
    const regimeBars: Record<string, number> = {
        uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0,
    };
    for (const seg of segments) {
        regimeBars[seg.type] = (regimeBars[seg.type] || 0) + seg.durationBars;
    }
    const totalBars = Object.values(regimeBars).reduce((s, v) => s + v, 0);

    // 4. For each indicator: weighted average of hit rates across regimes
    const confidences: Record<string, number> = {};
    const indicatorKeys = new Set(performances.map(p => p.indicator));

    for (const key of indicatorKeys) {
        const perfs = performances.filter(p => p.indicator === key);
        let weightedSum = 0;
        let weightTotal = 0;

        for (const p of perfs) {
            // Only include directional regimes (uptrend, downtrend) in the confidence score.
            // ranging/volatile/neutral measure "correctly staying out" which is a different metric
            // and shouldn't inflate confidence for directional signal quality.
            if (p.regime !== 'uptrend' && p.regime !== 'downtrend') continue;

            const weight = regimeBars[p.regime] || 0;
            if (weight === 0) continue;

            weightedSum += p.hitRate * weight;
            weightTotal += weight;
        }

        if (weightTotal > 0) {
            const rawConfidence = weightedSum / weightTotal;
            // Clamp to [minConfidence, maxConfidence] range
            confidences[key] = Math.max(minConfidence, Math.min(maxConfidence, rawConfidence));
        }
        // If no directional data, don't set → defaults to 0.6 in strategy-optimizer.ts
    }

    return confidences;
}
