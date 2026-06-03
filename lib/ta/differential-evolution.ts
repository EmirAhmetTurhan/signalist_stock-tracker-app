// lib/ta/differential-evolution.ts — Differential Evolution for Continuous Parameter Optimization
//
// DE optimizes continuous parameters (indicator periods, lookForward) for a given
// indicator combination. Unlike brute-force grid search (exponential in dimensions),
// DE scales linearly with population size × generations.
//
// Algorithm: DE/rand/1/bin (classic)
//   Mutation:  v = x_r1 + F * (x_r2 - x_r3)
//   Crossover: Binomial with probability CR
//   Selection: Greedy (trial replaces target if better)
//
// Zero-Allocation Architecture:
//   Entire population stored as single contiguous Float64Array(popSize × D).
//   No per-individual array allocations during the hot-loop.
//   Index arithmetic: individual(i) = popData[i * D + d]
//
// Integration: Called after MCTS discovers promising indicator combinations.
// Returns optimal parameters for each combination, evaluated via runStrategyBacktest.

import type { Candle } from './backtest';
import type { AllData, StrategyBacktestConfig, StrategyBacktestResult } from './strategy-optimizer';
import { runStrategyBacktest } from './strategy-optimizer';
import { OPTIMIZABLE_INDICATORS, rangeForTimeframe } from './optimizer';
import { recomputeAllIndicators, encodeMask, type GAIndividual } from './ga-optimizer';
import { computeCompositeScore } from './mcts-search';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DEOptions {
    /** Population size (NP). Default: 10 × dimensions, min 20, max 100. */
    populationSize?: number;
    /** Maximum generations. Default: 100. */
    maxGenerations?: number;
    /** Mutation factor F. Default: 0.8 */
    mutationFactor?: number;
    /** Crossover rate CR. Default: 0.7 */
    crossoverRate?: number;
    /** Strategy mode for backtest. Tested as ['all', 'majority']. */
    mode?: 'all' | 'majority';
    /** Interval string passed to backtest config. */
    interval?: string;
    /** Abort signal for early termination. */
    abortSignal?: AbortSignal;
    /** Progress callback: (generation, bestScore, bestParams) => void */
    onProgress?: (gen: number, bestScore: number, bestParams: Record<string, number>) => void;
    /** Convergence threshold: if best score improves less than this for N generations, stop. Default: 0.001 */
    convergenceThreshold?: number;
    /** Patience: generations without improvement before early stop. Default: 15. */
    patience?: number;
    /** Random seed for reproducibility. */
    seed?: number;
}

export interface DEResult {
    /** Best parameter set found. */
    bestParams: Record<string, number>;
    /** Best composite score achieved. */
    bestScore: number;
    /** Full backtest result at best parameters. */
    bestResult: StrategyBacktestResult;
    /** Total evaluations performed. */
    totalEvaluations: number;
    /** Generations completed. */
    generationsRun: number;
    /** Whether the optimizer converged before maxGenerations. */
    converged: boolean;
}

interface ParamDimension {
    key: string;
    min: number;
    max: number;
}

// ─── Seeded PRNG (xoshiro128**) ──────────────────────────────────────────────

/**
 * Simple seeded PRNG for reproducible DE runs.
 * xoshiro128** algorithm returning float64 in [0, 1).
 * Zero allocation — pure integer arithmetic on closure state.
 */
function createPRNG(seed: number): () => number {
    let s0 = seed ^ 0x9e3779b9;
    let s1 = (seed << 7) ^ 0x6c8e9cf5;
    let s2 = (seed >> 3) ^ 0xf3b5c8a1;
    let s3 = (seed * 0x9e3779b9) >>> 0;

    return () => {
        const result = Math.imul(s1 * 5, 9) >>> 0;
        const t = s1 << 9;

        s2 ^= s0;
        s3 ^= s1;
        s1 ^= s2;
        s0 ^= s3;
        s2 ^= t;
        s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;

        return (result & 0x7fffffff) / 0x80000000;
    };
}

// ─── Parameter Space ─────────────────────────────────────────────────────────

/**
 * Build parameter space from indicator combo.
 * Includes `lookForward` as the first dimension (range 5-30).
 */
function buildParamSpace(combo: string[], interval?: string): ParamDimension[] {
    const space: ParamDimension[] = [
        { key: 'lookForward', min: 5, max: 30 },
    ];

    // SPRINT 2 / B2: Timeframe-aware lookback range. 4h swing trade için
    // genişletilmiş [14, 42] arama uzayı kullanılır. 1d/1wk default'u kullanır.
    for (const indicator of combo) {
        const range = rangeForTimeframe(indicator, interval);
        if (range[0] > 0 && range[1] > range[0]) {
            space.push({
                key: indicator,
                min: range[0],
                max: range[1],
            });
        }
    }

    return space;
}

// ─── Flat Population: Single Float64Array Matrix ────────────────────────────

/**
 * Flat population stored as contiguous Float64Array.
 *
 * Layout:
 *   popData: Float64Array(np × D)  — all parameter vectors in one array
 *   popScores: Float64Array(np)    — cached composite scores
 *
 * Index arithmetic:
 *   individual i, dimension d → popData[i * D + d]
 *   score for individual i     → popScores[i]
 *
 * Total allocations: 3 (popData + popScores + trialVec).
 * Zero allocations during the entire hot-loop (mutation/crossover/selection).
 */
interface FlatPopulation {
    data: Float64Array;
    scores: Float64Array;
    np: number;
    D: number;
}

function createFlatPopulation(np: number, D: number): FlatPopulation {
    return {
        data: new Float64Array(np * D),
        scores: new Float64Array(np),
        np,
        D,
    };
}

/**
 * Initialize population using uniform random sampling within bounds.
 * Writes directly into the flat Float64Array matrix — zero intermediate arrays.
 */
function initializeFlatPopulation(
    pop: FlatPopulation,
    paramSpace: ParamDimension[],
    rng: () => number,
): void {
    const { data, np, D } = pop;
    for (let i = 0; i < np; i++) {
        const offset = i * D;
        for (let d = 0; d < D; d++) {
            const { min, max } = paramSpace[d];
            data[offset + d] = min + rng() * (max - min);
        }
    }
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Evaluate an individual at index `i` in the flat population.
 * Converts the typed array segment to Record<string, number>,
 * runs the full backtest, and writes the score to pop.scores[i].
 *
 * @returns The computed score (also stored in pop.scores[i]).
 */
function evaluateFlatIndividual(
    pop: FlatPopulation,
    i: number,
    combo: string[],
    paramSpace: ParamDimension[],
    candles: Candle[],
    allData: AllData,
    mode: 'all' | 'majority',
    interval: string | undefined,
): number {
    const { data, D } = pop;
    const offset = i * D;

    // Convert typed array segment → Record<string, number> (no allocation per-d)
    const params: Record<string, number> = {};
    for (let d = 0; d < D; d++) {
        params[paramSpace[d].key] = Math.round(data[offset + d]);
    }

    // Build temporary GAIndividual for recomputeAllIndicators
    const tempGA: GAIndividual = {
        indicatorMask: encodeMask(combo),
        params: { ...params },
        lookForward: params.lookForward ?? 14,
        mode: 'all',
        fitness: 0,
        rawWinRate: 0,
        totalSignals: 0,
        generation: 0,
    };

    // Recompute indicators with new parameters
    const updatedAllData = recomputeAllIndicators(allData, tempGA, candles);

    // Run backtest
    const result = runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
        lookForward: params.lookForward ?? 14,
        interval,
        mode,
    }, {
        customIndicators: combo,
        mode,
        interval,
    });

    // Compute composite score: WR × (Sharpe + 1) × √PF × √totalSignals
    const score = computeCompositeScore(
        result.winRate,
        result.sharpeRatio ?? 0,
        result.profitFactor ?? 0,
        result.totalSignals,
    );

    pop.scores[i] = score;
    return score;
}

/**
 * Evaluate entire initial population.
 */
function evaluateAll(
    pop: FlatPopulation,
    combo: string[],
    paramSpace: ParamDimension[],
    candles: Candle[],
    allData: AllData,
    mode: 'all' | 'majority',
    interval: string | undefined,
    abortSignal?: AbortSignal,
): number {
    let evals = 0;
    for (let i = 0; i < pop.np; i++) {
        if (abortSignal?.aborted) break;
        evaluateFlatIndividual(pop, i, combo, paramSpace, candles, allData, mode, interval);
        evals++;
    }
    return evals;
}

// ─── Mutation ────────────────────────────────────────────────────────────────

/**
 * DE/rand/1 mutation: v = x_r1 + F * (x_r2 - x_r3)
 *
 * Reads r1, r2, r3 from the flat population matrix via index arithmetic.
 * Writes mutation result directly to `trialVec` (pre-allocated outside hot-loop).
 *
 * Bounce-back boundary correction: if val < min → reflect back toward r1's value.
 * This preserves population diversity better than simple clamping.
 */
function mutateInto(
    trialVec: Float64Array,
    pop: FlatPopulation,
    iR1: number,
    iR2: number,
    iR3: number,
    F: number,
    paramSpace: ParamDimension[],
    rng: () => number,
): void {
    const { data, D } = pop;
    const offR1 = iR1 * D;
    const offR2 = iR2 * D;
    const offR3 = iR3 * D;

    for (let d = 0; d < D; d++) {
        let val = data[offR1 + d] + F * (data[offR2 + d] - data[offR3 + d]);

        // Bounce-back boundary correction
        const { min, max } = paramSpace[d];
        if (val < min) {
            val = min + rng() * (data[offR1 + d] - min);
        } else if (val > max) {
            val = max - rng() * (max - data[offR1 + d]);
        }

        trialVec[d] = val;
    }
}

// ─── Crossover ───────────────────────────────────────────────────────────────

/**
 * Binomial crossover: each dimension from trial with probability CR,
 * else from target (individual i in flat population).
 * Guarantees at least one dimension comes from trial (jRand).
 *
 * Operates in-place on `trialVec`, reading target from `pop.data[i * D]`.
 */
function crossoverInto(
    trialVec: Float64Array,
    pop: FlatPopulation,
    targetIdx: number,
    CR: number,
    rng: () => number,
): void {
    const { data, D } = pop;
    const offset = targetIdx * D;
    const jRand = Math.floor(rng() * D);

    for (let d = 0; d < D; d++) {
        if (d !== jRand && rng() >= CR) {
            trialVec[d] = data[offset + d];
        }
        // else: keep trialVec[d] as-is from mutation
    }
}

// ─── Main Optimizer ──────────────────────────────────────────────────────────

const DEFAULT_POPULATION_FACTOR = 10; // NP = 10 × D
const DEFAULT_MAX_GENERATIONS = 100;
const DEFAULT_F = 0.8;
const DEFAULT_CR = 0.7;
const DEFAULT_CONVERGENCE_THRESHOLD = 0.001;
const DEFAULT_PATIENCE = 15;
const MIN_POPULATION = 20;
const MAX_POPULATION = 100;

/**
 * Differential Evolution optimizer for indicator parameter tuning.
 *
 * Algorithm: DE/rand/1/bin with bounce-back boundary handling.
 *
 * Zero-Allocation Architecture:
 *   - Single Float64Array(np × D) for entire population
 *   - Single Float64Array(np) for cached scores
 *   - Single Float64Array(D) reusable trial vector
 *   - No per-individual array allocations during generation loop
 *   - Index arithmetic: individual(i)[d] = pop.data[i * D + d]
 *
 * Called after MCTS identifies promising indicator combinations.
 * Optimizes continuous parameters (indicator periods, lookForward)
 * using the composite score as fitness.
 *
 * @param combo - Indicator combination (e.g. ['rsi', 'macd', 'alma'])
 * @param candles - Price candle data
 * @param allData - Pre-computed indicator data
 * @param options - DE configuration
 * @returns Best parameters found with full backtest result
 */
export function differentialOptimize(
    combo: string[],
    candles: Candle[],
    allData: AllData,
    options: DEOptions = {},
): DEResult {
    const paramSpace = buildParamSpace(combo, options.interval);
    const D = paramSpace.length;

    if (D === 0) {
        throw new Error('DE: empty parameter space — no optimizable indicators in combo');
    }

    // ── Configuration ──
    const np = Math.max(MIN_POPULATION, Math.min(MAX_POPULATION,
        options.populationSize ?? DEFAULT_POPULATION_FACTOR * D));
    const maxGen = options.maxGenerations ?? DEFAULT_MAX_GENERATIONS;
    const F = options.mutationFactor ?? DEFAULT_F;
    const CR = options.crossoverRate ?? DEFAULT_CR;
    const mode = options.mode ?? 'all';
    const interval = options.interval;
    const abortSignal = options.abortSignal;
    const onProgress = options.onProgress;
    const threshold = options.convergenceThreshold ?? DEFAULT_CONVERGENCE_THRESHOLD;
    const patience = options.patience ?? DEFAULT_PATIENCE;
    const rng = createPRNG(options.seed ?? Date.now());

    // ── Initialize Flat Population (3 allocations total) ──
    const pop = createFlatPopulation(np, D);
    const trialVec = new Float64Array(D);
    initializeFlatPopulation(pop, paramSpace, rng);

    // ── Evaluate Initial Population ──
    let totalEvaluations = evaluateAll(pop, combo, paramSpace, candles, allData, mode, interval, abortSignal);

    // ── Track Best Individual ──
    let bestIdx = 0;
    let bestScore = pop.scores[0];
    for (let i = 1; i < np; i++) {
        if (pop.scores[i] > bestScore) {
            bestScore = pop.scores[i];
            bestIdx = i;
        }
    }

    // Cache the best result for the final return (need full backtest result)
    let bestResult: StrategyBacktestResult | null = null;

    let generationsWithoutImprovement = 0;
    let gen = 0;

    // ── Main Loop: Zero-Allocation Hot-Path ──
    for (gen = 0; gen < maxGen; gen++) {
        if (abortSignal?.aborted) break;

        let genImproved = false;

        for (let i = 0; i < np; i++) {
            if (abortSignal?.aborted) break;

            // Select 3 distinct random indices ≠ i
            let r1: number, r2: number, r3: number;
            do { r1 = Math.floor(rng() * np); } while (r1 === i);
            do { r2 = Math.floor(rng() * np); } while (r2 === i || r2 === r1);
            do { r3 = Math.floor(rng() * np); } while (r3 === i || r3 === r1 || r3 === r2);

            // Mutation → writes into trialVec (reusable buffer, zero allocation)
            mutateInto(trialVec, pop, r1, r2, r3, F, paramSpace, rng);

            // Crossover → modifies trialVec in-place
            crossoverInto(trialVec, pop, i, CR, rng);

            // Evaluate trial (writes score to a temporary, then compare)
            const trialScore = evaluateTrialVector(
                trialVec, i, pop, combo, paramSpace,
                candles, allData, mode, interval,
            );
            totalEvaluations++;

            // Greedy selection: if trial improves, copy into population
            if (trialScore > pop.scores[i]) {
                // Copy trialVec into pop.data[i * D ... i * D + D]
                const offset = i * D;
                for (let d = 0; d < D; d++) {
                    pop.data[offset + d] = trialVec[d];
                }
                pop.scores[i] = trialScore;
                genImproved = true;

                // Update global best
                if (trialScore > bestScore) {
                    bestScore = trialScore;
                    bestIdx = i;
                }
            }
        }

        // Convergence check
        if (genImproved) {
            generationsWithoutImprovement = 0;
        } else {
            generationsWithoutImprovement++;
        }

        // Progress callback
        if (onProgress) {
            onProgress(gen, bestScore, paramsToRecord(pop, bestIdx, paramSpace));
        }

        // Early stop
        if (generationsWithoutImprovement >= patience) {
            break;
        }
    }

    // ── Final Evaluation at Best Parameters ──
    // We need the full StrategyBacktestResult for the best individual.
    // Re-evaluate to get the result object (scores alone aren't enough).
    const bestParams = paramsToRecord(pop, bestIdx, paramSpace);
    bestResult = evaluateBestFinal(pop, bestIdx, combo, paramSpace, candles, allData, mode, interval);

    return {
        bestParams,
        bestScore,
        bestResult,
        totalEvaluations,
        generationsRun: gen + 1,
        converged: generationsWithoutImprovement >= patience,
    };
}

// ─── Evaluation Helpers (extracted to keep main loop clean) ──────────────────

/**
 * Evaluate a trial vector written to `trialVec` and return its composite score.
 * Does NOT write to pop.scores — the caller decides whether to accept.
 */
function evaluateTrialVector(
    trialVec: Float64Array,
    _targetIdx: number,
    pop: FlatPopulation,
    combo: string[],
    paramSpace: ParamDimension[],
    candles: Candle[],
    allData: AllData,
    mode: 'all' | 'majority',
    interval: string | undefined,
): number {
    const D = pop.D;

    // Convert trialVec → Record<string, number>
    const params: Record<string, number> = {};
    for (let d = 0; d < D; d++) {
        params[paramSpace[d].key] = Math.round(trialVec[d]);
    }

    // Build temporary GAIndividual
    const tempGA: GAIndividual = {
        indicatorMask: encodeMask(combo),
        params: { ...params },
        lookForward: params.lookForward ?? 14,
        mode: 'all',
        fitness: 0,
        rawWinRate: 0,
        totalSignals: 0,
        generation: 0,
    };

    const updatedAllData = recomputeAllIndicators(allData, tempGA, candles);

    const result = runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
        lookForward: params.lookForward ?? 14,
        interval,
        mode,
    }, {
        customIndicators: combo,
        mode,
        interval,
    });

    return computeCompositeScore(
        result.winRate,
        result.sharpeRatio ?? 0,
        result.profitFactor ?? 0,
        result.totalSignals,
    );
}

/**
 * Final evaluation of the best individual — returns full StrategyBacktestResult.
 */
function evaluateBestFinal(
    pop: FlatPopulation,
    idx: number,
    combo: string[],
    paramSpace: ParamDimension[],
    candles: Candle[],
    allData: AllData,
    mode: 'all' | 'majority',
    interval: string | undefined,
): StrategyBacktestResult {
    const D = pop.D;
    const offset = idx * D;

    const params: Record<string, number> = {};
    for (let d = 0; d < D; d++) {
        params[paramSpace[d].key] = Math.round(pop.data[offset + d]);
    }

    const tempGA: GAIndividual = {
        indicatorMask: encodeMask(combo),
        params: { ...params },
        lookForward: params.lookForward ?? 14,
        mode: 'all',
        fitness: 0,
        rawWinRate: 0,
        totalSignals: 0,
        generation: 0,
    };

    const updatedAllData = recomputeAllIndicators(allData, tempGA, candles);

    return runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
        lookForward: params.lookForward ?? 14,
        interval,
        mode,
    }, {
        customIndicators: combo,
        mode,
        interval,
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paramsToRecord(
    pop: FlatPopulation,
    idx: number,
    paramSpace: ParamDimension[],
): Record<string, number> {
    const D = pop.D;
    const offset = idx * D;
    const record: Record<string, number> = {};
    for (let d = 0; d < D; d++) {
        record[paramSpace[d].key] = Math.round(pop.data[offset + d]);
    }
    return record;
}
