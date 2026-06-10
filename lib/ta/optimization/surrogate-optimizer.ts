// lib/ta/surrogate-optimizer.ts — Pure TypeScript Parameter Optimization
// Phase 3 of the Deep Discovery pipeline.
// Replaces the original Python/scikit-optimize approach with a
// Latin Hypercube Sampling + Adaptive Refinement strategy.
// Zero external dependencies.

import type { Candle } from '@/lib/ta/simulation/backtest';
import type { AllData } from '@/lib/ta/strategy-optimizer/types';
import { runStrategyBacktest } from '@/lib/ta/strategy-optimizer/run-backtest';
import { OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import { recomputeAllIndicators, encodeMask } from '@/lib/ta/optimization/ga-optimizer';
import type { GAIndividual } from '@/lib/ta/optimization/ga-optimizer';
import type { SurrogateResult } from '@/lib/ta/discovery-types';
import type { StrategyMode } from '@/lib/ta/types';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Default number of optimization iterations. */
const DEFAULT_ITERATIONS = 50;

/** Number of initial exploration iterations (Latin Hypercube phase). */
const EXPLORATION_RATIO = 0.4; // 40% exploration, 60% exploitation

/** Number of top points to refine around during exploitation phase. */
const TOP_POINTS_TO_REFINE = 5;

/** Exploitation refinement range (± this fraction of the original range). */
const REFINEMENT_FRACTION = 0.2;

// ─── Latin Hypercube Sampling ───────────────────────────────────────────────────

/**
 * Generate N samples across a parameter space using Latin Hypercube Sampling.
 * Ensures each parameter dimension is uniformly covered.
 *
 * LHS divides each dimension into N equal strata and places exactly one
 * sample in each stratum (row), then shuffles column assignments.
 * This guarantees better space coverage than pure random sampling.
 */
function latinHypercubeSample(
    paramRanges: { key: string; min: number; max: number }[],
    n: number,
    seed?: number,
): Record<string, number>[] {
    const rng = createSeededRng(seed);
    const dims = paramRanges.length;
    const samples: Record<string, number>[] = [];

    // Create permutation indices for each dimension
    const permutations: number[][] = [];
    for (let d = 0; d < dims; d++) {
        const perm = Array.from({ length: n }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        permutations.push(perm);
    }

    // Generate samples
    for (let i = 0; i < n; i++) {
        const sample: Record<string, number> = {};
        for (let d = 0; d < dims; d++) {
            const { key, min, max } = paramRanges[d];
            const stratum = permutations[d][i];
            // Random point within this stratum
            const fraction = (stratum + rng()) / n;
            sample[key] = Math.round(min + fraction * (max - min));
            // Clamp to valid range
            sample[key] = Math.max(min, Math.min(max, sample[key]));
        }
        samples.push(sample);
    }

    return samples;
}

// ─── Seeded RNG ─────────────────────────────────────────────────────────────────

/**
 * Simple seeded PRNG (Mulberry32) for reproducible results.
 * Returns a function that produces values in [0, 1).
 */
function createSeededRng(seed?: number): () => number {
    let state = seed ?? Math.floor(Math.random() * 2147483647);
    return () => {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Parameter Space Builder ────────────────────────────────────────────────────

/**
 * Build parameter search space for a given indicator combination.
 * Extracts param ranges from OPTIMIZABLE_INDICATORS registry.
 * Always includes lookForward as the first dimension.
 */
function buildParamSpace(combo: string[]): { key: string; min: number; max: number }[] {
    const space: { key: string; min: number; max: number }[] = [
        { key: 'lookForward', min: 5, max: 30 },
    ];

    for (const indicator of combo) {
        const entry = OPTIMIZABLE_INDICATORS[indicator.toUpperCase()];
        if (entry) {
            space.push({
                key: indicator, // Use lowercase key matching GA convention
                min: entry.range[0],
                max: entry.range[1],
            });
        }
    }

    return space;
}

// ─── Evaluation Function ────────────────────────────────────────────────────────

/**
 * Evaluate a parameter set by running a backtest with recomputed indicators.
 */
function evaluateParams(
    combo: string[],
    params: Record<string, number>,
    candles: Candle[],
    allData: AllData,
    interval: string,
    mode: StrategyMode,
): { winRate: number; totalSignals: number } {
    const lookForward = params.lookForward ?? 14;

    // Build a temporary GAIndividual to recompute indicators with these params
    const tempIndividual: GAIndividual = {
        indicatorMask: encodeMask(combo),
        params: { ...params },
        lookForward,
        mode,
        fitness: 0,
        rawWinRate: 0,
        totalSignals: 0,
        generation: 0,
    };

    // Recompute indicator data with new parameters
    const updatedAllData = recomputeAllIndicators(allData, tempIndividual, candles);

    // Run backtest
    const result = runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
        lookForward,
        interval,
        mode,
    }, {
        customIndicators: combo,
        mode,
        interval,
    });

    return { winRate: result.winRate, totalSignals: result.totalSignals };
}

// ─── Main Optimizer ─────────────────────────────────────────────────────────────

export interface SurrogateOptimizeOptions {
    /** Data interval ('1d', '4h') */
    interval: string;
    /** Number of optimization iterations. Default: 50 */
    nIterations?: number;
    /** Seed for reproducible results. */
    seed?: number;
}

/**
 * Surrogate-Based Parameter Optimization — Phase 3 of Deep Discovery.
 *
 * Two-phase approach:
 * 1. **Exploration** (40%): Latin Hypercube Sampling uniformly covers the
 *    parameter space. Each sample point is evaluated via full backtest.
 * 2. **Exploitation** (60%): Takes the top 5 performing points and samples
 *    densely around them (±20% of original range) to find the local optimum.
 *
 * Both 'all' and 'majority' modes are tested. The mode producing the best
 * composite score (winRate × √totalSignals) is selected.
 *
 * @param combo - Indicator keys to optimize (e.g. ['rsi', 'macd', 'dmi'])
 * @param candles - Price candle data
 * @param allData - Pre-computed indicator data
 * @param options - Optimization config
 * @returns Best parameters, win rate, and metadata
 */
export function surrogateOptimize(
    combo: string[],
    candles: Candle[],
    allData: AllData,
    options: SurrogateOptimizeOptions,
): SurrogateResult {
    const nIterations = options.nIterations ?? DEFAULT_ITERATIONS;
    const seed = options.seed;
    const paramSpace = buildParamSpace(combo);

    // Track all evaluated points
    interface EvalPoint {
        params: Record<string, number>;
        winRate: number;
        totalSignals: number;
        score: number;
        mode: StrategyMode;
    }
    const allPoints: EvalPoint[] = [];

    const explorationCount = Math.floor(nIterations * EXPLORATION_RATIO);
    const exploitationCount = nIterations - explorationCount;
    const modes: StrategyMode[] = ['all', 'majority'];

    // ── Phase 1: Exploration via Latin Hypercube ──
    const lhsSamples = latinHypercubeSample(paramSpace, explorationCount, seed);

    for (const params of lhsSamples) {
        for (const mode of modes) {
            const result = evaluateParams(combo, params, candles, allData, options.interval, mode);
            const score = result.totalSignals >= 20
                ? result.winRate * Math.sqrt(result.totalSignals)
                : 0;
            allPoints.push({ params, ...result, score, mode });
        }
    }

    // ── Phase 2: Exploitation — refine around top performers ──
    // Sort by score and take top N unique param sets
    allPoints.sort((a, b) => b.score - a.score);
    const topPoints = getUniqueTopPoints(allPoints, TOP_POINTS_TO_REFINE);

    if (topPoints.length > 0) {
        const samplesPerPoint = Math.floor(exploitationCount / topPoints.length);

        for (const topPoint of topPoints) {
            // Build narrowed range around this top point
            const narrowedSpace = paramSpace.map(dim => {
                const center = topPoint.params[dim.key] ?? Math.round((dim.min + dim.max) / 2);
                const range = dim.max - dim.min;
                const delta = Math.max(1, Math.round(range * REFINEMENT_FRACTION));
                return {
                    key: dim.key,
                    min: Math.max(dim.min, center - delta),
                    max: Math.min(dim.max, center + delta),
                };
            });

            const refinedSamples = latinHypercubeSample(
                narrowedSpace,
                samplesPerPoint,
                seed ? seed + allPoints.length : undefined,
            );

            for (const params of refinedSamples) {
                for (const mode of modes) {
                    const result = evaluateParams(combo, params, candles, allData, options.interval, mode);
                    const score = result.totalSignals >= 20
                        ? result.winRate * Math.sqrt(result.totalSignals)
                        : 0;
                    allPoints.push({ params, ...result, score, mode });
                }
            }
        }
    }

    // ── Select best result ──
    allPoints.sort((a, b) => b.score - a.score);
    const best = allPoints[0];

    if (!best || best.score === 0) {
        // No viable result found — return defaults
        const defaultParams: Record<string, number> = { lookForward: 14 };
        for (const dim of paramSpace) {
            if (dim.key !== 'lookForward') {
                defaultParams[dim.key] = dim.min;
            }
        }
        return {
            combo,
            bestParams: defaultParams,
            bestWinRate: 0,
            totalSignals: 0,
            iterationsRun: allPoints.length,
            mode: 'all',
        };
    }

    return {
        combo,
        bestParams: { ...best.params },
        bestWinRate: best.winRate,
        totalSignals: best.totalSignals,
        iterationsRun: allPoints.length,
        mode: best.mode,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Select top N unique parameter sets (avoid duplicates from same LHS point
 * tested with different modes).
 */
function getUniqueTopPoints(
    points: { params: Record<string, number>; score: number }[],
    n: number,
): { params: Record<string, number>; score: number }[] {
    const seen = new Set<string>();
    const unique: { params: Record<string, number>; score: number }[] = [];

    for (const point of points) {
        const key = JSON.stringify(point.params);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(point);
        }
        if (unique.length >= n) break;
    }

    return unique;
}
