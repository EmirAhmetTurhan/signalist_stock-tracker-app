// lib/ta/ga-optimizer.ts — Genetic Algorithm / Hybrid Optimization Engine
// Phase 3: Genetic Algorithm (joint indicator-selection + parameter optimization)
// Phase 4: Local Refinement (hill-climbing on top GA results)
// No React state — usable from server actions, Inngest jobs, and UI components.

import type { Candle } from '@/lib/ta/types';
import type { AllData, DiscoveredStrategy } from '@/lib/ta/strategy-optimizer/types';
import { runStrategyBacktest } from '@/lib/ta/strategy-optimizer/run-backtest';
import { optimizeStrategyParams, sanitizeParams } from '@/lib/ta/strategy-optimizer/optimize-params';
import { DISCOVERY_POOL } from '@/lib/ta/registry/indicator-registry';
import { OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import { INDICATOR_TO_ALLDATA_FIELD } from '@/lib/ta/registry/indicator-all-data-map';
import type { StrategyMode } from '@/lib/ta/types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Minimum number of signals required for a strategy to be considered valid.
 *  Prevents overfitting: a strategy with <20 signals is statistically unreliable
 *  regardless of win rate. Used throughout GA fitness + Phase 2 screening. */
export const MIN_SIGNAL_THRESHOLD = 20;

/**
 * @deprecated Use DISCOVERY_POOL.length instead. The hard cap of 4 indicators
 * has been removed to allow the discovery engine to explore strategies with
 * any number of indicators (2 to DISCOVERY_POOL.length).
 */
export const MAX_INDICATORS = 4;

/** Dynamic maximum — allows GA to explore all indicator counts up to pool size. */
function getMaxIndicators(): number {
    return DISCOVERY_POOL.length;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A single individual in the GA population representing a complete strategy. */
export interface GAIndividual {
    /** 17-bit bitmask: bit i = 1 means DISCOVERY_POOL[i] is selected */
    indicatorMask: number;
    /** Per-indicator parameters (only for OPTIMIZABLE indicators that are selected) */
    params: Record<string, number>;
    /** Global lookForward value */
    lookForward: number;
    /** Voting mode */
    mode: StrategyMode;
    /** Computed fitness (cached after evaluation) — includes complexity penalty */
    fitness: number;
    /** Raw (unpenalized) win rate from the last backtest */
    rawWinRate: number;
    /** Total signals from the last backtest (cached) */
    totalSignals: number;
    /** Generation this individual was created */
    generation: number;
}

/** Configuration for the GA evolution loop. */
export interface GAConfig {
    populationSize: number;
    maxGenerations: number;
    crossoverRate: number;
    mutationRate: number;
    eliteRate: number;
    tournamentSize: number;
    staleGenerationLimit: number;
}

/** Default GA configuration — tuned for 17-indicator pool. */
export const DEFAULT_GA_CONFIG: GAConfig = {
    populationSize: 150,
    maxGenerations: 100,
    crossoverRate: 0.8,
    mutationRate: 0.1,
    eliteRate: 0.1,
    tournamentSize: 3,
    staleGenerationLimit: 10,
};

// ─── Bitmask Helpers ────────────────────────────────────────────────────────────

/** Decode a bitmask into indicator keys from DISCOVERY_POOL. */
export function decodeMask(mask: number): string[] {
    const indicators: string[] = [];
    for (let i = 0; i < DISCOVERY_POOL.length; i++) {
        if (mask & (1 << i)) {
            indicators.push(DISCOVERY_POOL[i]);
        }
    }
    return indicators;
}

/** Encode indicator keys into a bitmask. */
export function encodeMask(indicators: string[]): number {
    let mask = 0;
    for (const key of indicators) {
        const idx = DISCOVERY_POOL.indexOf(key);
        if (idx >= 0) mask |= (1 << idx);
    }
    return mask;
}

/** Count how many bits are set in a mask. */
function popcount(mask: number): number {
    let count = 0;
    while (mask) {
        count += mask & 1;
        mask >>>= 1;
    }
    return count;
}

// ─── Indicator Recomputation ────────────────────────────────────────────────────


/**
 * Recompute a single indicator with a given parameter value and inject into AllData.
 * Returns a shallow copy of allData with the recomputed data injected.
 */
function recomputeIndicator(
    allData: AllData,
    indicatorKey: string,
    paramValue: number,
    candles: Candle[],
): AllData {
    const entry = OPTIMIZABLE_INDICATORS[indicatorKey.toUpperCase()];
    if (!entry) return allData; // Non-optimizable indicator, keep as-is

    const rawData = entry.compute(candles, paramValue);
    const formattedData = entry.formatData(rawData);
    const dataField = INDICATOR_TO_ALLDATA_FIELD[indicatorKey];
    if (!dataField) return allData;

    const updated: AllData = { ...allData };
    (updated as any)[dataField] = formattedData as any;
    return updated;
}

/**
 * Recompute ALL selected indicators with the individual's params.
 * Indicators not in OPTIMIZABLE_INDICATORS are left at their default values in allData.
 */
export function recomputeAllIndicators(
    allData: AllData,
    individual: GAIndividual,
    candles: Candle[],
): AllData {
    let updated = { ...allData };
    const indicators = decodeMask(individual.indicatorMask);
    for (const key of indicators) {
        const entry = OPTIMIZABLE_INDICATORS[key.toUpperCase()];
        if (!entry) continue;
        const val = individual.params[key];
        if (val === undefined) continue;
        const rawData = entry.compute(candles, val);
        const formattedData = entry.formatData(rawData);
        const dataField = INDICATOR_TO_ALLDATA_FIELD[key];
        if (dataField) {
            (updated as any)[dataField] = formattedData as any;
        }
    }
    return updated;
}

// ─── Fitness Function ───────────────────────────────────────────────────────────

/**
 * Compute fitness and raw win rate for an individual using walk-forward validation.
 *
 * ALGORITHM:
 * 1. Split candles 70/30 into train/test sets
 * 2. Backtest on TRAIN set → winRate_train, totalSignals_train
 * 3. Backtest on TEST set → winRate_test, totalSignals_test
 * 4. fitness = (winRate_train × √totalSignals_train) × validationMultiplier
 *    where validationMultiplier = min(1.0, winRate_test / winRate_train)
 *    This penalizes strategies that overfit to training data.
 * 5. rawWinRate = average of train and test win rates
 * 6. totalSignals = sum of train and test signals
 *
 * The validationMultiplier is the KEY anti-overfitting mechanism:
 * - A strategy scoring 90% on train but 45% on test gets ×0.5 penalty
 * - A strategy scoring 65% on both train and test gets ×1.0 (no penalty)
 * - This naturally selects strategies that generalize well.
 */
function computeFitness(
    individual: GAIndividual,
    candles: Candle[],
    allData: AllData,
    interval: string,
): { fitness: number; rawWinRate: number; totalSignals: number } {
    const indicators = decodeMask(individual.indicatorMask);
    if (indicators.length < 2) return { fitness: 0, rawWinRate: 0, totalSignals: 0 };

    // ── Walk-forward split: 70% train, 30% test ──
    const splitPoint = Math.floor(candles.length * 0.7);
    // Ensure minimum training data (need warmup + lookForward)
    if (splitPoint < 60) return { fitness: 0, rawWinRate: 0, totalSignals: 0 };
    const trainCandles = candles.slice(0, splitPoint);
    const testCandles = candles.slice(splitPoint);

    // Recompute indicators with this individual's params (on FULL candles for correct computation)
    const updatedAllData = recomputeAllIndicators(allData, individual, candles);

    // ── Backtest on TRAIN set ──
    const trainResult = runStrategyBacktest(trainCandles, 'CUSTOM', updatedAllData, {
        lookForward: individual.lookForward,
        interval,
        mode: individual.mode,
    }, {
        customIndicators: indicators,
        mode: individual.mode,
        interval,
    });

    // Proportional threshold: fewer candles → fewer expected signals
    const proportionalThreshold = Math.max(10,
        Math.floor(MIN_SIGNAL_THRESHOLD * trainCandles.length / candles.length));
    if (trainResult.totalSignals < proportionalThreshold) {
        return { fitness: 0, rawWinRate: 0, totalSignals: 0 };
    }

    // ── Backtest on TEST set ──
    const testResult = runStrategyBacktest(testCandles, 'CUSTOM', updatedAllData, {
        lookForward: individual.lookForward,
        interval,
        mode: individual.mode,
    }, {
        customIndicators: indicators,
        mode: individual.mode,
        interval,
    });

    // ── Compute scores ──
    // Core fitness: higher winRate × more signals = better
    const trainScore = trainResult.winRate * Math.sqrt(trainResult.totalSignals);

    // Validation multiplier: penalize strategies that don't generalize
    let validationMultiplier = 1.0;
    if (testResult.totalSignals >= Math.floor(proportionalThreshold / 2) && trainResult.winRate > 0) {
        validationMultiplier = Math.min(1.0, testResult.winRate / trainResult.winRate);
    } else if (testResult.totalSignals < Math.floor(proportionalThreshold / 2)) {
        validationMultiplier = 0.3; // Severe penalty: not enough test signals = overfit
    }

    let fitness = trainScore * validationMultiplier;

    // ALMA + WaveTrend synergy boost: deep research identified crossover complementarity
    if (indicators.includes('alma') && indicators.includes('wavetrend')) {
        fitness *= 1.05; // 5% fitness boost to known-good combos
    }

    return {
        fitness,
        rawWinRate: (trainResult.winRate + testResult.winRate) / 2,
        totalSignals: trainResult.totalSignals + testResult.totalSignals,
    };
}

// ─── Selection ──────────────────────────────────────────────────────────────────

/** Tournament selection: pick k random individuals, return the best. */
function tournamentSelect(population: GAIndividual[], k: number): GAIndividual {
    let best = population[Math.floor(Math.random() * population.length)];
    for (let i = 1; i < k; i++) {
        const contender = population[Math.floor(Math.random() * population.length)];
        if (contender.fitness > best.fitness) best = contender;
    }
    return best;
}

// ─── Crossover ──────────────────────────────────────────────────────────────────

/**
 * Two-point crossover on indicator masks:
 * - Pick two random crossover points
 * - Bits between the two points come from parent2, rest from parent1
 */
function crossoverMask(mask1: number, mask2: number): [number, number] {
    const numBits = DISCOVERY_POOL.length;
    const point1 = Math.floor(Math.random() * numBits);
    const point2 = Math.floor(Math.random() * numBits);
    const start = Math.min(point1, point2);
    const end = Math.max(point1, point2);

    // Build segment mask: bits [start, end) are 1
    const segmentMask = ((1 << (end - start)) - 1) << start;

    // Child1: bits from mask1 outside segment, bits from mask2 inside segment
    const child1 = (mask1 & ~segmentMask) | (mask2 & segmentMask);
    // Child2: bits from mask2 outside segment, bits from mask1 inside segment
    const child2 = (mask2 & ~segmentMask) | (mask1 & segmentMask);

    return [child1, child2];
}

/**
 * BLX-α blend crossover on numeric params.
 * For each shared param: childVal = uniform(p1 - α*d, p2 + α*d) where d = |p1 - p2|
 * α = 0.5 balances exploration and exploitation.
 */
function crossoverParams(
    params1: Record<string, number>,
    params2: Record<string, number>,
    indicators1: string[],
    indicators2: string[],
): [Record<string, number>, Record<string, number>] {
    const child1: Record<string, number> = {};
    const child2: Record<string, number> = {};

    // Collect all unique indicator keys from both parents
    const allKeys = new Set([...Object.keys(params1), ...Object.keys(params2)]);

    for (const key of allKeys) {
        const p1 = params1[key];
        const p2 = params2[key];

        if (p1 !== undefined && p2 !== undefined) {
            // Both parents have this param → BLX-α blend
            const d = Math.abs(p1 - p2);
            const alpha = 0.5;
            const minVal = Math.min(p1, p2) - alpha * d;
            const maxVal = Math.max(p1, p2) + alpha * d;
            const range = maxVal - minVal;

            // Clamp to valid range if available
            const upperKey = key.toUpperCase();
            const entry = OPTIMIZABLE_INDICATORS[upperKey];
            const [validStart, validEnd] = entry ? entry.range : [-Infinity, Infinity];

            const c1 = Math.max(validStart, Math.min(validEnd, Math.round(minVal + Math.random() * range)));
            const c2 = Math.max(validStart, Math.min(validEnd, Math.round(minVal + Math.random() * range)));

            child1[key] = c1;
            child2[key] = c2;
        } else if (p1 !== undefined) {
            // Only parent1 has it → child1 keeps it, child2 inherits
            child1[key] = p1;
            child2[key] = p1;
        } else {
            // Only parent2 has it
            child1[key] = p2!;
            child2[key] = p2!;
        }
    }

    return [child1, child2];
}

/** Perform crossover between two parents, returning two offspring. */
function crossover(
    parent1: GAIndividual,
    parent2: GAIndividual,
): [GAIndividual, GAIndividual] {
    // ── Mask crossover ──
    const [mask1, mask2] = crossoverMask(parent1.indicatorMask, parent2.indicatorMask);

    // ── Params crossover ──
    const inds1 = decodeMask(mask1);
    const inds2 = decodeMask(mask2);
    const [params1, params2] = crossoverParams(parent1.params, parent2.params, inds1, inds2);

    // ── lookForward crossover: random choice between parents' values ──
    const lf1 = Math.random() < 0.5 ? parent1.lookForward : parent2.lookForward;
    const lf2 = Math.random() < 0.5 ? parent1.lookForward : parent2.lookForward;

    return [
        {
            indicatorMask: mask1,
            params: params1,
            lookForward: lf1,
            mode: Math.random() < 0.5 ? parent1.mode : parent2.mode,
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        },
        {
            indicatorMask: mask2,
            params: params2,
            lookForward: lf2,
            mode: Math.random() < 0.5 ? parent1.mode : parent2.mode,
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        },
    ];
}

// ─── Mutation ───────────────────────────────────────────────────────────────────

/**
 * Mutate an individual in-place.
 * - Bit-flip on indicator mask (between 2 and DISCOVERY_POOL.length)
 * - Perturb params (± range/10)
 * - Perturb lookForward (± 1-3)
 * - Flip mode between 'all' and 'majority'
 */
function mutate(individual: GAIndividual, mutationRate: number): void {
    const numBits = DISCOVERY_POOL.length;

    // ── Bit-flip on mask ──
    let newMask = individual.indicatorMask;
    for (let i = 0; i < numBits; i++) {
        if (Math.random() < mutationRate) {
            newMask ^= (1 << i); // Flip bit i
        }
    }
    // Ensure at least 2 indicators, at most DISCOVERY_POOL.length
    const maxInd = getMaxIndicators();
    const maskPop = popcount(newMask);
    if (maskPop < 2) {
        // Turn on 2 random bits
        const offBits: number[] = [];
        for (let i = 0; i < numBits; i++) {
            if (!(newMask & (1 << i))) offBits.push(i);
        }
        // Shuffle and pick first 2
        for (let i = offBits.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [offBits[i], offBits[j]] = [offBits[j], offBits[i]];
        }
        const needed = 2 - maskPop;
        for (let n = 0; n < needed && n < offBits.length; n++) {
            newMask |= (1 << offBits[n]);
        }
    } else if (maskPop > maxInd) {
        // Turn off random bits until we're at maxInd
        const onBits: number[] = [];
        for (let i = 0; i < numBits; i++) {
            if (newMask & (1 << i)) onBits.push(i);
        }
        for (let i = onBits.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [onBits[i], onBits[j]] = [onBits[j], onBits[i]];
        }
        const toRemove = maskPop - maxInd;
        for (let n = 0; n < toRemove; n++) {
            newMask &= ~(1 << onBits[n]);
        }
    }
    individual.indicatorMask = newMask;

    // ── Param perturbation ──
    const indicators = decodeMask(individual.indicatorMask);
    for (const key of indicators) {
        const entry = OPTIMIZABLE_INDICATORS[key.toUpperCase()];
        if (!entry) continue;

        if (Math.random() < mutationRate) {
            const [start, end] = entry.range;
            const range = end - start;
            const delta = Math.max(1, Math.round(range * 0.1));
            const current = individual.params[key] ?? start;
            const newVal = current + (Math.random() < 0.5 ? -delta : delta);
            individual.params[key] = Math.max(start, Math.min(end, newVal));
        }

        // Ensure param exists even if it wasn't set (crossover may not set it)
        if (individual.params[key] === undefined) {
            const [start] = entry.range;
            individual.params[key] = start;
        }
    }

    // Remove params for indicators no longer selected
    const selectedSet = new Set(indicators);
    for (const key of Object.keys(individual.params)) {
        if (!selectedSet.has(key)) {
            delete individual.params[key];
        }
    }

    // ── lookForward perturbation ──
    if (Math.random() < mutationRate) {
        const delta = Math.floor(Math.random() * 3) + 1; // 1-3
        individual.lookForward += Math.random() < 0.5 ? -delta : delta;
        individual.lookForward = Math.max(5, Math.min(30, individual.lookForward));
    }

    // ── Mode mutation: flip between 'all' and 'majority' ──
    if (Math.random() < mutationRate) {
        individual.mode = individual.mode === 'all' ? 'majority' : 'all';
    }
}

// ─── Population Initialization ──────────────────────────────────────────────────

interface ScreenEntry {
    indicators: string[];
    winRate: number;
    totalSignals: number;
    bestLookForward?: number;
}

/**
 * Initialize the GA population:
 * 1. Seed (50): Take top 50 from Phase 2 screening (use default mode)
 * 2. Random (50): Random indicator selection (2 to pool.length) + random params + random mode
 * 3. Mutated Seeds (50): Seeds with perturbations + random mode
 */
function initializePopulation(
    topScreen: ScreenEntry[],
    candles: Candle[],
    allData: AllData,
    interval: string,
    mode: StrategyMode,
    populationSize: number,
): GAIndividual[] {
    const population: GAIndividual[] = [];
    const seedCount = Math.min(Math.floor(populationSize / 3), topScreen.length);
    const randomCount = Math.floor(populationSize / 3);
    const mutatedCount = populationSize - seedCount - randomCount;

    /** Randomly assign 'all' or 'majority' mode with 50/50 probability. */
    function randomMode(): StrategyMode {
        return Math.random() < 0.5 ? 'all' : 'majority';
    }

    // 1. SEED individuals from top screen results
    for (let i = 0; i < seedCount; i++) {
        const entry = topScreen[i];
        const params: Record<string, number> = {};
        for (const key of entry.indicators) {
            const optEntry = OPTIMIZABLE_INDICATORS[key.toUpperCase()];
            if (optEntry) {
                const [start] = optEntry.range;
                params[key] = start; // Default param
            }
        }
        population.push({
            indicatorMask: encodeMask(entry.indicators),
            params,
            lookForward: entry.bestLookForward ?? 14,
            mode,
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        });
    }

    // 2. RANDOM individuals (2 to pool.length, random mode)
    for (let i = 0; i < randomCount; i++) {
        const maxN = DISCOVERY_POOL.length;
        const numIndicators = Math.floor(Math.random() * (maxN - 1)) + 2; // 2-pool.length
        const shuffled = [...DISCOVERY_POOL].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, numIndicators);
        const params: Record<string, number> = {};
        for (const key of selected) {
            const entry = OPTIMIZABLE_INDICATORS[key.toUpperCase()];
            if (entry) {
                const [start, end] = entry.range;
                params[key] = start + Math.floor(Math.random() * (end - start + 1));
            }
        }
        population.push({
            indicatorMask: encodeMask(selected),
            params,
            lookForward: Math.floor(Math.random() * 26) + 5, // 5-30
            mode: randomMode(),
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        });
    }

    // 3. MUTATED SEEDS (only possible if we have seeds to mutate)
    if (seedCount > 0) {
        for (let i = 0; i < mutatedCount; i++) {
            const seedIdx = i % seedCount;
            const seed = population[seedIdx];
            const mutant: GAIndividual = {
                ...seed,
                params: { ...seed.params },
                mode: randomMode(),
                fitness: 0,
                rawWinRate: 0,
                totalSignals: 0,
            };

            // Perturb params
            for (const key of Object.keys(mutant.params)) {
                const entry = OPTIMIZABLE_INDICATORS[key.toUpperCase()];
                if (entry) {
                    const [start, end] = entry.range;
                    const delta = Math.floor(Math.random() * 5) + 1;
                    mutant.params[key] = Math.max(start, Math.min(end, mutant.params[key] + (Math.random() < 0.5 ? -delta : delta)));
                }
            }

            // Add/remove 1-2 indicators (respect pool size upper bound)
            const currentInds = decodeMask(mutant.indicatorMask);
            if (Math.random() < 0.5 && currentInds.length < DISCOVERY_POOL.length) {
                // Add a random indicator not already selected
                const available = DISCOVERY_POOL.filter(k => !currentInds.includes(k));
                if (available.length > 0) {
                    const toAdd = available[Math.floor(Math.random() * available.length)];
                    currentInds.push(toAdd);
                    const entry = OPTIMIZABLE_INDICATORS[toAdd.toUpperCase()];
                    if (entry) {
                        const [start, end] = entry.range;
                        mutant.params[toAdd] = start + Math.floor(Math.random() * (end - start + 1));
                    }
                    mutant.indicatorMask = encodeMask(currentInds);
                }
            } else {
                // Remove a random indicator (keep at least 2)
                if (currentInds.length > 2) {
                    const removeIdx = Math.floor(Math.random() * currentInds.length);
                    const removed = currentInds[removeIdx];
                    currentInds.splice(removeIdx, 1);
                    delete mutant.params[removed];
                    mutant.indicatorMask = encodeMask(currentInds);
                }
            }

            // Perturb lookForward
            const lfDelta = Math.floor(Math.random() * 3) + 1;
            mutant.lookForward = Math.max(5, Math.min(30, mutant.lookForward + (Math.random() < 0.5 ? -lfDelta : lfDelta)));

            population.push(mutant);
        }
    }

    return population.slice(0, populationSize);
}

// ─── Main GA Evolution Loop ─────────────────────────────────────────────────────

/**
 * Run the Genetic Algorithm evolution loop.
 * Returns the final population sorted by fitness (descending).
 */
export async function geneticOptimize(
    candles: Candle[],
    allData: AllData,
    topScreen: ScreenEntry[],
    options: {
        interval: string;
        mode: StrategyMode;
        config?: Partial<GAConfig>;
    },
): Promise<GAIndividual[]> {
    const config: GAConfig = { ...DEFAULT_GA_CONFIG, ...options.config };
    const { interval, mode } = options;

    // ── Initialize population ──
    let population = initializePopulation(
        topScreen, candles, allData, interval, mode, config.populationSize,
    );

    // ── Evaluate initial population ──
    for (const ind of population) {
        const result = computeFitness(ind, candles, allData, interval);
        ind.fitness = result.fitness;
        ind.rawWinRate = result.rawWinRate;
        ind.totalSignals = result.totalSignals;
    }

    // Apply fitness sharing (niching) to promote diversity
    applyFitnessSharing(population);

    population.sort((a, b) => b.fitness - a.fitness);

    let bestFitness = population[0].fitness;
    let staleGenerations = 0;
    const eliteCount = Math.max(1, Math.floor(config.populationSize * config.eliteRate));

    // ── Evolution loop ──
    for (let gen = 1; gen <= config.maxGenerations; gen++) {
        // Yield to event loop every generation to prevent main-thread blocking
        if (gen > 1 && gen % 2 === 0) await new Promise(r => setTimeout(r, 0));

        const newPopulation: GAIndividual[] = [];

        // 1. Elite preservation
        for (let i = 0; i < eliteCount; i++) {
            newPopulation.push({ ...population[i], params: { ...population[i].params } });
        }

        // 2. Generate offspring
        while (newPopulation.length < config.populationSize) {
            const parent1 = tournamentSelect(population, config.tournamentSize);
            const parent2 = tournamentSelect(population, config.tournamentSize);

            let offspring: GAIndividual[];
            if (Math.random() < config.crossoverRate) {
                offspring = crossover(parent1, parent2);
            } else {
                // Clone parents with copies of params
                offspring = [
                    { ...parent1, params: { ...parent1.params } },
                    { ...parent2, params: { ...parent2.params } },
                ];
            }

            for (const child of offspring) {
                mutate(child, config.mutationRate);
                const result = computeFitness(child, candles, allData, interval);
                child.fitness = result.fitness;
                child.rawWinRate = result.rawWinRate;
                child.totalSignals = result.totalSignals;
                child.generation = gen;
            }

            newPopulation.push(...offspring);
        }

        // 3. Truncate to population size
        newPopulation.sort((a, b) => b.fitness - a.fitness);
        population = newPopulation.slice(0, config.populationSize);

        // 4. Apply fitness sharing (niching) — penalize duplicate indicator masks
        applyFitnessSharing(population);
        population.sort((a, b) => b.fitness - a.fitness);

        // 5. Check convergence
        if (population[0].fitness > bestFitness) {
            bestFitness = population[0].fitness;
            staleGenerations = 0;
        } else {
            staleGenerations++;
        }

        if (staleGenerations >= config.staleGenerationLimit) {
            break; // Early termination
        }
    }

    return population;
}

/**
 * Fitness Sharing (Niching):
 * Divides each individual's fitness by the number of individuals sharing
 * the same indicator mask. This penalizes overcrowding of identical
 * indicator combinations, forcing the GA to explore diverse strategies.
 *
 * Without this, the population converges to a single indicator combo
 * with minor param variations — missing potentially better combinations.
 */
function applyFitnessSharing(population: GAIndividual[]): void {
    const maskCounts = new Map<number, number>();
    for (const ind of population) {
        maskCounts.set(ind.indicatorMask, (maskCounts.get(ind.indicatorMask) ?? 0) + 1);
    }
    for (const ind of population) {
        const count = maskCounts.get(ind.indicatorMask) ?? 1;
        if (count > 1 && ind.fitness > 0) {
            ind.fitness = ind.fitness / count;
        }
    }
}

// ─── Phase 4: Local Refinement ──────────────────────────────────────────────────

/**
 * Take the top N individuals from GA and refine their parameters.
 * Uses optimizeStrategyParams (sequential optimization) to hill-climb
 * on each individual's indicator combination.
 *
 * CRITICAL FIX (2026-06-01):
 * - Previously used ind.fitness (complexity-penalized) for comparisons and display,
 *   causing "94% win rate / 0 signals" paradox when fitness ≈ 94 but raw win rate
 *   was actually 100% and totalSignals was 0 due to missing indicator recomputation.
 * - Now uses ind.rawWinRate for comparisons, recomputes allData before the final
 *   backtest, and uses the validated backtest's winRate + totalSignals directly.
 *
 * ENHANCEMENT (2026-06-01):
 * - Uses individual's own mode (mode diversity) instead of a fixed mode parameter
 * - Sorts by composite score (winRate × √totalSignals) instead of winRate alone
 * - This ensures strategies with more signals + good WR rank higher
 */
export function localRefine(
    topGA: GAIndividual[],
    candles: Candle[],
    allData: AllData,
    interval: string,
    _mode: StrategyMode, // kept for backward compat, but individual.mode is used
    topN: number = 5,
): DiscoveredStrategy[] {
    const refined: DiscoveredStrategy[] = [];

    // Enforce distinct indicator masks: select the top N individuals with unique masks.
    // This prevents GA diversity collapse where the top 5 are the same indicator combo.
    const distinct: GAIndividual[] = [];
    const seenMasks = new Set<number>();
    for (const ind of topGA) {
        if (!seenMasks.has(ind.indicatorMask)) {
            distinct.push(ind);
            seenMasks.add(ind.indicatorMask);
        }
        if (distinct.length >= topN) break;
    }
    const count = Math.min(topN, distinct.length);

    for (let i = 0; i < count; i++) {
        const ind = distinct[i];
        const indicators = decodeMask(ind.indicatorMask);
        const indMode = ind.mode; // Use individual's mode (mode diversity)

        // Phase 4a: Hill-climbing via sequential optimization
        const optResult = optimizeStrategyParams(candles, allData, {
            indicators,
            interval,
            mode: indMode,
            convergenceRounds: 2,
        });

        // Choose best params: compare raw win rates (not penalized fitness).
        const bestParams = optResult.bestWinRate > ind.rawWinRate
            ? optResult.bestParams
            : { ...ind.params, lookForward: ind.lookForward };

        // Phase 4b: Recompute ALL indicator data with the chosen params,
        // then run a validated backtest.
        const tempInd: GAIndividual = {
            indicatorMask: ind.indicatorMask,
            params: bestParams,
            lookForward: bestParams.lookForward ?? 14,
            mode: indMode,
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        };
        const updatedAllData = recomputeAllIndicators(allData, tempInd, candles);

        const finalResult = runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
            lookForward: bestParams.lookForward ?? 14,
            interval,
            mode: indMode,
        }, {
            customIndicators: indicators,
            mode: indMode,
            interval,
        });

        refined.push({
            indicators,
            params: sanitizeParams(bestParams),
            winRate: finalResult.winRate,
            totalSignals: finalResult.totalSignals,
            rank: 0,
        });
    }

    // Sort by composite score: winRate × √totalSignals
    // This rewards strategies that produce BOTH high win rate AND many signals,
    // rather than just high win rate with very few signals (overfitted).
    refined.sort((a, b) => {
        const scoreA = a.winRate * Math.sqrt(a.totalSignals);
        const scoreB = b.winRate * Math.sqrt(b.totalSignals);
        return scoreB - scoreA;
    });
    refined.forEach((ds, idx) => { ds.rank = idx + 1; });

    return refined;
}
