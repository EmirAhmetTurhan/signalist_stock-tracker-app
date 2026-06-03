// lib/ta/hyperband-search.ts — Hyperband Multi-Fidelity Bracket Evaluation
//
// Hyperband accelerates strategy discovery by evaluating candidates at multiple
// fidelity levels using Index Masking (NOT physical candle slicing).
//
// Critical Design Rule (per user feedback):
//   - Indicators are ALWAYS computed on the FULL candle sequence
//   - Only the EVALUATION (metric computation) uses masked subsets
//   - This preserves path-dependent indicators (MACD, EMA, RSI, etc.)
//
// Each bracket evaluates candidates with progressively denser masks:
//   Bracket 0: 25% mask (lowest fidelity, fastest)
//   Bracket 1: 50% mask (medium fidelity)
//   Bracket 2: 100% mask (full evaluation, final selection)
//
// Integration: Hyperband wraps MCTS + DE to prune unpromising combos early.
//
// References:
//   - Li et al. "Hyperband: A Novel Bandit-Based Approach to Hyperparameter
//     Optimization" (ICLR 2017)
//   - User correction (2026-06-01): Physical slicing breaks path-dependent
//     indicators; use Index Masking instead.

import type { Candle } from './backtest';
import type { AllData, StrategyBacktestResult } from './strategy-optimizer';
import type { SignalProfile } from './types';
import { runStrategyBacktest } from './strategy-optimizer';
import { OPTIMIZABLE_INDICATORS } from './optimizer';
import { mctsSearch, computeCompositeScore, type MCTSOptions, type MCTSResult } from './mcts-search';
import { differentialOptimize, type DEOptions, type DEResult } from './differential-evolution';
import { computeMIPriorWeights, type MIOptions, type MIResult } from './mutual-information';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ETA = 3;                  // Downsampling rate (standard Hyperband value)
export const DEFAULT_MAX_CANDLES = 500; // R (maximum resource)
export const MIN_CANDLES_FOR_EVAL = 50; // Minimum mask density for ANY evaluation
export const MIN_SIGNALS_THRESHOLD = 20; // Minimum signals for a candidate to survive

// Mask density levels per bracket (fraction of total bars to evaluate)
export const MASK_DENSITIES: number[] = [0.25, 0.50, 1.0];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HyperbandOptions {
    /** Maximum number of candles to use as resource (R). Default: 500 */
    maxCandles?: number;
    /** Downsampling rate (η). Default: 3 */
    eta?: number;
    /** Minimum bracket resource (r). Default: 50 */
    minResource?: number;
    /** Look-forward bars for backtest. Default: 14 */
    lookForward?: number;
    /** Data interval string. */
    interval?: string;
    /** Abort signal for early termination. */
    abortSignal?: AbortSignal;
    /** Progress callback. */
    onProgress?: (phase: string, current: number, total: number) => void;
    /** MI Filter options. Pass to control prior weight computation. */
    miOptions?: MIOptions;
    /** MCTS options (maxNodes, maxDepth, iterations). */
    mctsOptions?: MCTSOptions;
    /** DE options for parameter optimization. */
    deOptions?: DEOptions;
    /** Random seed. */
    seed?: number;
    /** Signal profile for dynamic cooldown & crossover rules. */
    signalProfile?: SignalProfile;
}

export interface HyperbandBracketResult {
    /** Indicator combination evaluated. */
    combo: string[];
    /** Best parameters found for this combo. */
    bestParams: Record<string, number>;
    /** Composite score at full fidelity. */
    compositeScore: number;
    /** Full backtest result at full fidelity. */
    fullResult: StrategyBacktestResult;
    /** Which bracket produced this result. */
    bracketLevel: number;
    /** Whether this candidate survived all halving stages. */
    survived: boolean;
}

export interface HyperbandResult {
    /** All survivors across all brackets, sorted by composite score descending. */
    survivors: HyperbandBracketResult[];
    /** Top-K survivors (top 10 or fewer). */
    topK: HyperbandBracketResult[];
    /** MI prior weights used for this run. */
    priorWeights: Float64Array;
    /** MCTS search results. */
    mctsResult: MCTSResult;
    /** Total candidates evaluated across all brackets. */
    totalEvaluations: number;
    /** Total brackets executed. */
    totalBrackets: number;
}

// ─── Index Mask Generation ───────────────────────────────────────────────────

/**
 * Generate a stratified Uint8Array mask for a given density level.
 *
 * The mask selects a stratified subset of bars for EVALUATION only.
 * Indicator computation still runs on the FULL candle sequence.
 *
 * Stratification: evenly spaced indices across the full range, ensuring
 * chronological coverage. This avoids bias toward any particular time period.
 *
 * @param totalBars - Total number of candles/bars in the sequence
 * @param density - Fraction of bars to evaluate (0.0 to 1.0)
 * @param lookForward - Look-forward period (last `lookForward` bars are excluded from evaluation)
 * @returns Uint8Array where 1 = evaluate this bar, 0 = skip this bar
 */
function generateStratifiedMask(
    totalBars: number,
    density: number,
    lookForward: number,
): Uint8Array {
    const mask = new Uint8Array(totalBars);

    if (density >= 1.0) {
        // Full fidelity: evaluate all bars except warmup
        for (let i = lookForward; i < totalBars; i++) {
            mask[i] = 1;
        }
        return mask;
    }

    // Compute effective evaluation window (exclude last lookForward bars for returns)
    const evalEnd = totalBars - lookForward;
    const evalStart = lookForward; // Skip initial warmup
    const evalWindow = evalEnd - evalStart;

    if (evalWindow < MIN_CANDLES_FOR_EVAL) {
        // Too few bars, fall back to all
        for (let i = evalStart; i < evalEnd; i++) {
            mask[i] = 1;
        }
        return mask;
    }

    // Number of bars to select
    const targetCount = Math.max(MIN_CANDLES_FOR_EVAL, Math.round(evalWindow * density));

    // Stratified: select evenly spaced bars
    const step = evalWindow / targetCount;
    for (let k = 0; k < targetCount; k++) {
        const idx = evalStart + Math.min(Math.floor(k * step), evalWindow - 1);
        mask[idx] = 1;
    }

    return mask;
}

// ─── Single Bracket Evaluation ───────────────────────────────────────────────

/**
 * Evaluate a single indicator combination at a given mask density.
 * Returns the backtest result with the mask applied.
 */
function evaluateAtDensity(
    combo: string[],
    params: Record<string, number>,
    candles: Candle[],
    allData: AllData,
    density: number,
    lookForward: number,
    interval: string | undefined,
    signalProfile?: SignalProfile,
): StrategyBacktestResult {
    const mask = generateStratifiedMask(candles.length, density, lookForward);

    return runStrategyBacktest(
        candles,
        'CUSTOM',
        allData,
        { lookForward, interval, mode: 'all', signalMask: mask, signalProfile },
        { customIndicators: combo, interval, mode: 'all' },
    );
}

// ─── Bracket Execution ───────────────────────────────────────────────────────

/**
 * Get default parameters for an indicator combo (midpoint of optimizable range).
 */
function getDefaultParams(combo: string[], lookForward: number): Record<string, number> {
    const params: Record<string, number> = { lookForward };
    for (const ind of combo) {
        const entry = OPTIMIZABLE_INDICATORS[ind.toUpperCase()];
        if (entry) {
            params[ind] = Math.round((entry.range[0] + entry.range[1]) / 2);
        }
    }
    return params;
}


// ─── Main Hyperband Search ───────────────────────────────────────────────────

/**
 * Hyperband-based strategy discovery and optimization.
 *
 * Pipeline:
 *  1. Compute MI prior weights (indicator → prior for UCT)
 *  2. Run MCTS with MI priors to discover promising indicator combinations
 *  3. For each bracket level (low→high fidelity):
 *     a. Evaluate candidates at current mask density
 *     b. Prune bottom performers (keep top 1/η)
 *     c. Promote survivors to next bracket
 *  4. At highest fidelity, run DE parameter optimization on survivors
 *  5. Return top-K strategies sorted by composite score
 *
 * @param candles - Price candle data
 * @param allData - Pre-computed indicator data for all 17 indicators
 * @param options - Hyperband configuration
 * @returns Top strategies with optimized parameters
 */
// ─── Exported Bracket-Level Execution ────────────────────────────────────────
// These are exported so the Inngest job can run each bracket in a separate
// step.run() block with MongoDB checkpoints between them.

/**
 * Execute a single Hyperband bracket (public export for step-level decomposition).
 *
 * @param combos - Indicator combos to evaluate at this density
 * @param bracketLevel - Which bracket number (0, 1, 2)
 * @param density - Mask density for this bracket
 * @param candles - Full candle data
 * @param allData - Pre-computed indicator data
 * @param lookForward - Look-forward bars
 * @param interval - Data interval string
 * @param deOptions - If provided and density >= 1.0, run DE parameter optimization
 * @param abortSignal - Optional abort signal
 * @returns Evaluated bracket results
 */
export function executeBracket(
    combos: string[][],
    bracketLevel: number,
    density: number,
    candles: Candle[],
    allData: AllData,
    lookForward: number,
    interval: string | undefined,
    deOptions: DEOptions | undefined,
    abortSignal: AbortSignal | undefined,
    signalProfile?: SignalProfile,
): HyperbandBracketResult[] {
    const results: HyperbandBracketResult[] = [];

    for (let i = 0; i < combos.length; i++) {
        if (abortSignal?.aborted) break;

        const combo = combos[i];
        const defaultParams = getDefaultParams(combo, lookForward);

        // Evaluate at current density
        const result = evaluateAtDensity(
            combo, defaultParams, candles, allData,
            density, lookForward, interval, signalProfile,
        );

        // Compute composite score
        const score = computeCompositeScore(
            result.winRate,
            result.sharpeRatio ?? 0,
            result.profitFactor ?? 0,
            result.totalSignals,
        );

        // Prune — not enough signals or negative score
        if (result.totalSignals < MIN_SIGNALS_THRESHOLD || score <= 0) {
            continue;
        }

        // Final bracket level: run DE for parameter optimization
        if (density >= 1.0 && deOptions) {
            const deResult = differentialOptimize(combo, candles, allData, {
                ...deOptions,
                interval,
                abortSignal,
            });

            // Re-evaluate with DE-optimized params at full fidelity
            const fullResult = evaluateAtDensity(
                combo, deResult.bestParams, candles, allData,
                1.0, lookForward, interval, signalProfile,
            );

            const finalScore = computeCompositeScore(
                fullResult.winRate,
                fullResult.sharpeRatio ?? 0,
                fullResult.profitFactor ?? 0,
                fullResult.totalSignals,
            );

            results.push({
                combo,
                bestParams: deResult.bestParams,
                compositeScore: finalScore,
                fullResult,
                bracketLevel,
                survived: true,
            });
        } else {
            // Intermediate bracket level: store for potential promotion
            results.push({
                combo,
                bestParams: defaultParams,
                compositeScore: score,
                fullResult: result,
                bracketLevel,
                survived: false,
            });
        }
    }

    return results;
}

/**
 * Promote top combos from bracket results to the next fidelity level.
 * Keeps top 1/η (or at least 3) by composite score, merged with any
 * remaining combos not yet evaluated.
 *
 * @param bracketResults - Results from current bracket
 * @param activeCombos - All combos that were active before this bracket
 * @param eta - Downsampling rate (default: 3)
 * @returns Promoted combos for the next bracket level
 */
export function promoteCombos(
    bracketResults: HyperbandBracketResult[],
    activeCombos: string[][],
    eta: number = ETA,
): string[][] {
    // Sort by composite score descending
    bracketResults.sort((a, b) => b.compositeScore - a.compositeScore);

    // Keep top 1/η or at least 3
    const keepCount = Math.max(3, Math.ceil(bracketResults.length / eta));
    const promotedCombos = bracketResults.slice(0, keepCount).map(
        (r: HyperbandBracketResult) => r.combo,
    );

    // Merge with remaining active combos not yet evaluated
    const evaluatedSet = new Set(
        bracketResults.map((r: HyperbandBracketResult) => r.combo.join(',')),
    );
    const remainingCombos = activeCombos.filter(
        (c: string[]) => !evaluatedSet.has(c.join(',')),
    );

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const combo of [...promotedCombos, ...remainingCombos]) {
        const key = combo.join(',');
        if (!seen.has(key)) {
            seen.add(key);
            result.push(combo);
        }
    }

    return result;
}

export function hyperbandSearch(
    candles: Candle[],
    allData: AllData,
    options: HyperbandOptions = {},
): HyperbandResult {
    const lookForward = options.lookForward ?? 14;
    const interval = options.interval;
    const abortSignal = options.abortSignal;
    const onProgress = options.onProgress;
    const maxCandles = Math.min(options.maxCandles ?? DEFAULT_MAX_CANDLES, candles.length);
    const eta = options.eta ?? ETA;
    const miOptions = options.miOptions;
    const mctsOptions = options.mctsOptions;
    const deOptions = options.deOptions;
    const signalProfile = options.signalProfile;

    // Trim candles to max resource if needed
    const evalCandles = candles.length > maxCandles
        ? candles.slice(candles.length - maxCandles)
        : candles;

    // ── Phase 1: Compute MI Prior Weights ──
    onProgress?.('mi-filter', 0, 1);
    const miResult = computeMIPriorWeights(evalCandles, allData, {
        lookForward,
        ...miOptions,
    });
    const priorWeights = miResult.priorWeights;
    onProgress?.('mi-filter', 1, 1);

    // ── Phase 2: MCTS Search ──
    onProgress?.('mcts-search', 0, 1);
    const mctsResult = mctsSearch(evalCandles, allData, {
        ...mctsOptions,
        priorWeights,
        lookForward,
        interval,
        onProgress: (current: number, total: number) => {
            onProgress?.('mcts-search', current, total);
        },
        signal: abortSignal,
    });
    onProgress?.('mcts-search', 1, 1);

    // Get top combos from MCTS (sorted by composite score descending)
    const topCombos: string[][] = mctsResult.all.map(
        (s: { indicators: string[] }) => s.indicators,
    );
    if (topCombos.length === 0) {
        return {
            survivors: [],
            topK: [],
            priorWeights,
            mctsResult,
            totalEvaluations: 0,
            totalBrackets: 0,
        };
    }

    // ── Phase 3: Hyperband Brackets ──
    const densities = MASK_DENSITIES;
    const totalBrackets = densities.length;
    let totalEvaluations = 0;

    let activeCombos = topCombos;
    const allSurvivors: HyperbandBracketResult[] = [];

    for (let b = 0; b < totalBrackets; b++) {
        if (abortSignal?.aborted) break;

        const density = densities[b];

        onProgress?.('hyperband-bracket-' + b, 0, activeCombos.length);

        // Evaluate current bracket
        const bracketResults = executeBracket(
            activeCombos, b, density,
            evalCandles, allData,
            lookForward, interval,
            density >= 1.0 ? deOptions : undefined,
            abortSignal,
            signalProfile,
        );

        totalEvaluations += bracketResults.length;

        // Collect survivors from this bracket
        const bracketSurvivors = bracketResults.filter(
            (r: HyperbandBracketResult) => r.survived || density >= 1.0,
        );
        allSurvivors.push(...bracketSurvivors);

        // For intermediate brackets: promote top 1/η for next level
        if (b < totalBrackets - 1) {
            bracketResults.sort((a, b) => b.compositeScore - a.compositeScore);

            // Keep top 1/η or at least 3
            const keepCount = Math.max(3, Math.ceil(bracketResults.length / eta));
            const promotedCombos = bracketResults.slice(0, keepCount).map(
                (r: HyperbandBracketResult) => r.combo,
            );

            // Merge with remaining active combos not yet evaluated
            const evaluatedSet = new Set(
                bracketResults.map((r: HyperbandBracketResult) => r.combo.join(',')),
            );
            const remainingCombos = activeCombos.filter(
                (c: string[]) => !evaluatedSet.has(c.join(',')),
            );

            // Deduplicate while preserving order
            const seen = new Set<string>();
            activeCombos = [];
            for (const combo of [...promotedCombos, ...remainingCombos]) {
                const key = combo.join(',');
                if (!seen.has(key)) {
                    seen.add(key);
                    activeCombos.push(combo);
                }
            }

            if (activeCombos.length === 0) break;
        }
    }

    // ── Sort and Select Top-K ──
    allSurvivors.sort((a, b) => b.compositeScore - a.compositeScore);
    const topK = allSurvivors.slice(0, 10);

    return {
        survivors: allSurvivors,
        topK,
        priorWeights,
        mctsResult,
        totalEvaluations,
        totalBrackets,
    };
}
