// lib/ta/regime-strategy-builder.ts — Per-Regime Optimal Strategy Assembler
//
// Consumes regime segments + indicator performance metrics to assemble
// per-regime optimal indicator combinations with statistical guards.
//
// Output is a structured RegimeAnalysisReport suitable for UI consumption.

import type { MarketRegime } from '@/lib/ta/types';
import type { RegimeSegment } from '@/lib/ta/regime-detector';
import type { IndicatorRegimePerformance } from '@/lib/ta/indicator-evaluator';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A recommended strategy for a specific regime. */
export interface RegimeStrategy {
    regime: MarketRegime;
    /** Top-performing indicator keys for this regime */
    indicators: string[];
    /** Expected accuracy (from Beta-Binomial posterior) */
    accuracy: number;
    /** Expected signal frequency (e.g., "every 8 days") */
    signalFrequency: string;
    /** Number of regime starts evaluated */
    sampleSize: number;
    /** Whether the sample size is statistically sufficient (≥30) */
    sufficientSample: boolean;
}

/** Full regime analysis report for a symbol. */
export interface RegimeAnalysisReport {
    symbol: string;
    interval: string;
    analysisPeriod: string;
    /** Segments grouped by regime type */
    regimeMap: {
        uptrends: RegimeSegment[];
        downtrends: RegimeSegment[];
        rangingZones: RegimeSegment[];
        volatileBreakouts: RegimeSegment[];
    };
    /** Hit-rate matrix: regime → indicator → performance */
    indicatorPerformanceByRegime: Record<MarketRegime, Record<string, {
        hitRate: number;
        ci95: [number, number];
        sampleSize: number;
        sufficientSample: boolean;
    }>>;
    /** Recommended strategies per regime */
    optimalStrategies: RegimeStrategy[];
}

/** Options for buildRegimeStrategies. */
export interface RegimeStrategyBuilderOptions {
    /** Number of top strategies per regime (default: 3) */
    topN?: number;
    /** Minimum accuracy threshold (default: 0.5) */
    minAccuracy?: number;
    /** Minimum sample size for strategy recommendation (default: 15) */
    minSampleSize?: number;
}

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Build per-regime optimal strategies from regime segments and indicator performance data.
 *
 * For each regime type, selects the top `topN` indicators based on their historical
 * hit rate, filters by statistical significance (sampleSize ≥ minSampleSize),
 * and assembles a structured report.
 *
 * @param segments - Regime segments from segmentRegimes()
 * @param performances - Indicator performance metrics from evaluateIndicators()
 * @param symbol - Symbol being analyzed
 * @param interval - Timeframe interval
 * @param options - Builder options (topN, minAccuracy, minSampleSize)
 * @returns Structured RegimeAnalysisReport
 */
export function buildRegimeStrategies(
    segments: RegimeSegment[],
    performances: IndicatorRegimePerformance[],
    symbol: string = '',
    interval: string = '1d',
    options: RegimeStrategyBuilderOptions = {},
): RegimeAnalysisReport {
    const topN = options.topN ?? 3;
    const minAccuracy = options.minAccuracy ?? 0.5;
    const minSampleSize = options.minSampleSize ?? 15;

    // ── Group segments by regime type ──
    const regimeMap: RegimeAnalysisReport['regimeMap'] = {
        uptrends: [],
        downtrends: [],
        rangingZones: [],
        volatileBreakouts: [],
    };

    for (const seg of segments) {
        switch (seg.type) {
            case 'uptrend':
                regimeMap.uptrends.push(seg);
                break;
            case 'downtrend':
                regimeMap.downtrends.push(seg);
                break;
            case 'ranging':
            case 'neutral':
                regimeMap.rangingZones.push(seg);
                break;
            case 'volatile':
                regimeMap.volatileBreakouts.push(seg);
                break;
        }
    }

    // ── Build performance matrix ──
    const allRegimes: MarketRegime[] = ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'];
    const indicatorPerformanceByRegime: RegimeAnalysisReport['indicatorPerformanceByRegime'] = {
        uptrend: {},
        downtrend: {},
        ranging: {},
        volatile: {},
        neutral: {},
    };

    for (const perf of performances) {
        const regimeEntry = indicatorPerformanceByRegime[perf.regime];
        if (!regimeEntry) continue;

        regimeEntry[perf.indicator] = {
            hitRate: perf.hitRate,
            ci95: perf.hitRateCI,
            sampleSize: perf.sampleSize,
            sufficientSample: perf.sufficientSample,
        };
    }

    // ── Build optimal strategies per regime ──
    const optimalStrategies: RegimeStrategy[] = [];

    for (const regime of allRegimes) {
        // Filter: regime type, sufficient sample, above min accuracy
        const candidates = performances
            .filter((p) => p.regime === regime && p.sampleSize >= minSampleSize && p.hitRate >= minAccuracy)
            .sort((a, b) => b.hitRate - a.hitRate);

        for (let i = 0; i < Math.min(topN, candidates.length); i++) {
            const p = candidates[i];
            const avgBarsBefore = Math.round(p.avgBarsBefore);

            optimalStrategies.push({
                regime,
                indicators: [p.indicator],
                accuracy: p.hitRate,
                signalFrequency: avgBarsBefore > 0
                    ? `every ${avgBarsBefore} bars before regime`
                    : 'at regime start',
                sampleSize: p.sampleSize,
                sufficientSample: p.sufficientSample,
            });
        }

        // If no candidates with sufficient sample, note it
        if (candidates.length === 0) {
            optimalStrategies.push({
                regime,
                indicators: [],
                accuracy: 0,
                signalFrequency: 'insufficient data',
                sampleSize: 0,
                sufficientSample: false,
            });
        }
    }

    // ── Determine analysis period ──
    let analysisPeriod = '';
    if (segments.length > 0) {
        const first = segments[0];
        const last = segments[segments.length - 1];
        analysisPeriod = `${first.startDate} → ${last.endDate}`;
    }

    return {
        symbol,
        interval,
        analysisPeriod,
        regimeMap,
        indicatorPerformanceByRegime,
        optimalStrategies,
    };
}