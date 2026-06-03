// lib/ta/combinatorial-search.ts — Exhaustive Combinatorial Search Engine
// Phase 2 of the Deep Discovery pipeline.
// Generates ALL possible indicator combinations (2 to n) and tests each
// with multiple lookForward values and modes. Returns top 100 by composite score.
//
// PARALLEL IMPLEMENTATION:
// Uses worker_threads via the Worker Pool to distribute combinations across
// all available CPU cores. Automatically falls back to sequential processing
// when worker threads are unavailable or when the workload is small.
// Auto-detects core count via os.cpus().length — works on any machine.

import type { Candle } from './backtest';
import type { AllData } from './strategy-optimizer';
import { DISCOVERY_POOL } from './indicator-registry';
import { runParallelCombinatorialSearch } from './worker-pool';
import type { CombinationResult } from './discovery-types';

// ─── Configuration ──────────────────────────────────────────────────────────────

// Note: LookForward values, modes, chunk sizes are defined in worker-pool.ts
// and parallel-worker.ts to keep them co-located with the execution logic.

// ─── Combination Generator ──────────────────────────────────────────────────────

/**
 * Generate all C(n, k) combinations from an array.
 * Uses iterative approach to avoid stack overflow for large inputs.
 */
export function generateCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (k > arr.length) return [];
    if (k === arr.length) return [arr.slice()];

    const results: T[][] = [];

    // Iterative combination generation using index tracking
    const indices = Array.from({ length: k }, (_, i) => i);

    while (true) {
        results.push(indices.map(i => arr[i]));

        // Find rightmost index that can be incremented
        let i = k - 1;
        while (i >= 0 && indices[i] === arr.length - k + i) {
            i--;
        }
        if (i < 0) break;

        // Increment and reset subsequent indices
        indices[i]++;
        for (let j = i + 1; j < k; j++) {
            indices[j] = indices[j - 1] + 1;
        }
    }

    return results;
}

/**
 * Count total combinations that will be generated for a given pool size.
 * C(n,2) + C(n,3) + ... + C(n,n)
 */
export function countTotalCombinations(poolSize: number): number {
    let total = 0;
    for (let k = 2; k <= poolSize; k++) {
        total += binomialCoefficient(poolSize, k);
    }
    return total;
}

/** Calculate C(n, k) = n! / (k! × (n-k)!) */
function binomialCoefficient(n: number, k: number): number {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    // Use iterative approach to avoid overflow
    let result = 1;
    for (let i = 0; i < Math.min(k, n - k); i++) {
        result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
}

// ─── Work Chunk Interface ───────────────────────────────────────────────────────

// Note: Individual combo processing (processCombo) is now handled by
// worker threads in parallel-worker.ts. The worker pool in worker-pool.ts
// manages distribution across CPU cores with automatic fallback.

// ─── Main Search Engine ─────────────────────────────────────────────────────────

export interface CombinatorialSearchOptions {
    /** Indicator pool to search. Defaults to DISCOVERY_POOL. */
    pool?: string[];
    /** Interval for backtest. */
    interval: string;
    /** Minimum indicator count to test. Default: 2 */
    minIndicators?: number;
    /** Maximum indicator count to test. Default: pool.length */
    maxIndicators?: number;
    /** Progress callback: (current, total) */
    onProgress?: (current: number, total: number) => void;
    /** Optional AbortSignal for cancellation. When aborted, returns partial results. */
    signal?: AbortSignal;
    /**
     * Force sequential processing (disable worker threads).
     * Useful for testing environments where worker_threads may not be available.
     */
    forceSequential?: boolean;
}

/**
 * Exhaustive Combinatorial Search — Phase 2 of Deep Discovery.
 *
 * PARALLEL: Uses worker_threads to distribute combinations across all available
 * CPU cores. The number of workers is auto-detected via os.cpus().length.
 * Falls back to sequential processing when worker threads are unavailable
 * (e.g., in test environments or single-core systems).
 *
 * Tests ALL C(n,k) indicator combinations for k = 2..n,
 * with 6 lookForward values × 2 modes = 12 backtests per combo.
 *
 * Filters results by MIN_SIGNAL_THRESHOLD and ranks by composite score.
 * Returns Top 100 results.
 *
 * @param candles - Price candle data
 * @param allData - Pre-computed indicator data for all indicators
 * @param options - Search configuration
 * @returns Promise resolving to Top 100 CombinationResult[] sorted by score descending
 */
export async function exhaustiveCombinatorialSearch(
    candles: Candle[],
    allData: AllData,
    options: CombinatorialSearchOptions,
): Promise<CombinationResult[]> {
    const pool = options.pool ?? DISCOVERY_POOL;
    const minK = options.minIndicators ?? 2;
    const maxK = options.maxIndicators ?? pool.length;
    const interval = options.interval;
    const onProgress = options.onProgress;
    const signal = options.signal;
    const forceSequential = options.forceSequential ?? false;

    // Pre-generate all combinations for all k values
    const allCombos: string[][] = [];
    for (let k = minK; k <= maxK; k++) {
        const combos = generateCombinations(pool, k);
        for (const combo of combos) {
            allCombos.push(combo);
        }
    }

    // If forced sequential or very few combos, use sequential path
    if (forceSequential || allCombos.length < 50) {
        return sequentialSearch(allCombos, candles, allData, interval, onProgress, signal);
    }

    // Use parallel worker pool (auto-detects cores, falls back to sequential)
    try {
        const results = await runParallelCombinatorialSearch(
            allCombos,
            candles,
            allData,
            interval,
            onProgress,
            signal,
        );
        return results;
    } catch (err) {
        console.warn('[CombinatorialSearch] Worker pool failed, falling back to sequential:', err);
        return sequentialSearch(allCombos, candles, allData, interval, onProgress, signal);
    }
}

/**
 * Sequential fallback: processes combinations in chunks, yielding the event loop
 * between batches. Used when worker threads are unavailable or workload is small.
 */
async function sequentialSearch(
    allCombos: string[][],
    candles: Candle[],
    allData: AllData,
    interval: string,
    onProgress?: (current: number, total: number) => void,
    signal?: AbortSignal,
): Promise<CombinationResult[]> {
    // Use the worker pool's exported sequential fallback directly.
    // Do NOT call runParallelCombinatorialSearch here — that would re-attempt
    // worker creation and cause infinite recursion on failure.
    const { sequentialFallback } = await import('./worker-pool');
    return sequentialFallback(allCombos, candles, allData, interval, onProgress, signal);
}
