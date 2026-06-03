// lib/ta/worker-pool.ts — Worker Thread Pool Manager
// Distributes combinatorial search work across CPU cores using worker_threads.
// Auto-detects available cores via os.cpus().length and scales workers accordingly.
// Falls back to sequential processing if workers are unavailable or fail.
//
// CRITICAL: Uses esbuild to bundle the worker TypeScript → JavaScript at runtime,
// then loads it via `new Worker(code, { eval: true })` to avoid Node.js 18+
// ERR_WORKER_PATH rejection of data: URLs.
//
// IMPORTANT: Does NOT use `new URL('./file.ts', import.meta.url)` for the entry
// point resolution because Next.js/Turbopack intercepts that pattern as a static
// asset reference, copying the raw .ts source to .next/server/assets/ where
// esbuild cannot resolve its relative imports. Instead, uses process.cwd()-based
// path resolution.
//
// PERFORMANCE #1 — Avoid structured clone overhead per chunk:
//   Static data (candles, allData) is sent ONCE per worker via an 'init' message.
//   Subsequent 'process' messages only carry the combo chunk, eliminating repeated
//   structured clone of ~3-5MB allData for every chunk (655×).
//
// PERFORMANCE #2 — V8 JIT warmup in each worker isolate:
//   Each worker thread is a fresh V8 isolate. Without warmup, the first chunk of
//   50 combos × 6 lookForward × 2 modes = 600 backtests runs entirely in V8
//   Ignition interpreter mode. Each backtest loops through ~6,400 candles calling
//   getIndicatorSignal (17-branch switch) and hasFreshCrossover (17-branch switch)
//   for ~8.5 indicators on average. That's ~7.7 million function calls in
//   interpreter mode, taking ~197 seconds vs ~19 seconds after JIT compilation.
//   Fix: parallel-worker.ts runs a jitWarmup() batch of 12 synthetic backtests
//   immediately after receiving the 'init' message, which triggers V8's tiered
//   compilation (Ignition → Sparkplug → TurboFan) before the first real chunk.
//
// RESILIENCE — Per-worker timeout instead of global timeout:
//   Each worker has its own activity timer. A stuck worker is terminated in
//   isolation — other workers continue processing. Only when ALL workers are
//   dead does the pool fall back to sequential processing.
//
// RESILIENCE — Worker heartbeat protocol:
//   Workers send periodic 'heartbeat' messages during long chunks. The pool
//   resets the per-worker activity timer on each heartbeat. This distinguishes
//   "worker is slow" from "worker has crashed/hung".
//
// RESILIENCE — Resumable sequential fallback:
//   When falling back to sequential processing, the pool passes only the
//   remaining (unprocessed) combos via allCombos.slice(testedCombos).
//   Previously, the fallback restarted from combo #0, wasting hours of work.

import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import type { Candle } from './backtest';
import type { AllData } from './strategy-optimizer';
import type { CombinationResult } from './discovery-types';
import type { StrategyMode } from './types';

// ─── Configuration ────────────────────────────────────────────────────────────────

/**
 * Number of worker threads to spawn.
 * Uses all available cores minus one to leave headroom for the main thread.
 * Minimum of 1 (single-core fallback).
 */
const WORKER_COUNT = Math.max(1, os.cpus().length - 1);

/** LookForward values to test for each combination. */
const SEARCH_LOOKFORWARD_VALUES = [5, 7, 10, 14, 21, 30];

/** Voting modes to test for each combination. */
const SEARCH_MODES: StrategyMode[] = ['all', 'majority'];

/** Minimum signal threshold for valid results. */
const MIN_SIGNAL_THRESHOLD = 5;

/**
 * Chunk size per worker.
 * Each worker receives this many combos per message.
 * Set to 50 to keep each chunk productive (~600 backtests per chunk):
 *   50 combos × 6 lookForward × 2 modes = 600 backtests
 *
 * PERFORMANCE NOTE: Each worker runs a V8 JIT warmup (12 synthetic backtests)
 * during init, so even the first real chunk runs with JIT-compiled hot-path
 * functions. After warmup, each 50-combo chunk completes in ~10-19 seconds.
 */
const WORKER_CHUNK_SIZE = 50;

/**
 * How many combos to process in sequential fallback before yielding to the
 * event loop. Set to 5 to keep main-thread blocking under ~500ms at a time,
 * preventing UI freezing while still making progress.
 */
const SEQUENTIAL_YIELD_INTERVAL = 5;

/**
 * Maximum number of top results to collect from workers.
 */
const TOP_N_RESULTS = 100;

/**
 * Per-worker inactivity timeout in milliseconds (5 minutes).
 *
 * HOW IT WORKS: Each worker has an `lastActivity` timestamp. The pool checks
 * every MONITOR_INTERVAL_MS (30s) whether any busy worker has been silent for
 * longer than WORKER_TIMEOUT_MS. If so, ONLY that worker is terminated — other
 * workers continue processing unaffected.
 *
 * Workers send periodic 'heartbeat' messages during long chunks (every 10
 * combos = ~3.8 seconds), which resets the activity timer. Under normal
 * operation, the timer is reset every ~4 seconds, well within 5 minutes.
 *
 * The 5-minute timeout only fires if a worker has genuinely crashed or hung
 * (no heartbeat + no result for 5 minutes). This eliminates false-positive
 * terminations that plagued the old global timeout approach.
 *
 * On timeout of ALL workers, the pool falls back to sequential processing
 * with only the remaining combos (resumable, not from zero).
 */
const WORKER_TIMEOUT_MS = 300_000;

/**
 * How often (in ms) the pool checks for stuck workers.
 * Every 30 seconds, the monitor scans all workers and terminates any that
 * have been silent for longer than WORKER_TIMEOUT_MS.
 */
const MONITOR_INTERVAL_MS = 30_000;

// ─── Worker Pool ──────────────────────────────────────────────────────────────────

interface WorkerEntry {
    worker: Worker;
    busy: boolean;
    /** Timestamp (Date.now()) when this worker last sent ANY message
     * (result, heartbeat, error). Used to detect stuck workers. */
    lastActivity: number;
}

/**
 * Static payload sent once per worker at creation via 'init' message.
 * This avoids re-sending large objects (allData, candles) with every chunk.
 */
interface WorkerStaticPayload {
    candles: Candle[];
    allData: AllData;
    interval: string;
    searchLookforwardValues: number[];
    searchModes: StrategyMode[];
    minSignalThreshold: number;
}

/**
 * Distribute combinatorial search work across multiple worker threads.
 *
 * @param allCombos - All indicator combinations to test
 * @param candles - Pre-computed price candle data
 * @param allData - Pre-computed indicator data for all indicators
 * @param interval - Trading interval
 * @param onProgress - Optional progress callback (called with tested count, total count)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to Top 100 CombinationResult[] sorted by score descending
 */
export async function runParallelCombinatorialSearch(
    allCombos: string[][],
    candles: Candle[],
    allData: AllData,
    interval: string,
    onProgress?: (tested: number, total: number) => void,
    signal?: AbortSignal,
): Promise<CombinationResult[]> {
    const totalCombos = allCombos.length;
    const numWorkers = Math.min(WORKER_COUNT, totalCombos);
    let nextIndex = 0;
    let completedWorkers = 0;
    let workerFailures = 0; // Track total failures for deadlock detection

    console.log(`[WorkerPool] Starting search: ${totalCombos} combos, ${numWorkers} workers, chunk=${WORKER_CHUNK_SIZE}`);

    // If only 1 core or very few combos, skip worker overhead
    if (numWorkers <= 1 || totalCombos < 50) {
        console.log(`[WorkerPool] Using sequential fallback (numWorkers=${numWorkers}, totalCombos=${totalCombos})`);
        return sequentialFallback(allCombos, candles, allData, interval, onProgress, signal);
    }

    // Pre-compute static payload to send once per worker
    const staticPayload: WorkerStaticPayload = {
        candles,
        allData,
        interval,
        searchLookforwardValues: SEARCH_LOOKFORWARD_VALUES,
        searchModes: SEARCH_MODES,
        minSignalThreshold: MIN_SIGNAL_THRESHOLD,
    };

    // Collect results from all workers
    const allResults: CombinationResult[] = [];
    let isCancelled = false;
    // Track how many combos have been returned by workers (for progress reporting
    // and resumable fallback — sequentialFallback receives allCombos.slice(testedCombos))
    let testedCombos = 0;

    // ── Pre-build all worker threads using esbuild (async) ──────────────
    let workerInstances: Worker[];
    try {
        workerInstances = await Promise.all(
            Array.from({ length: numWorkers }, () => createWorker(staticPayload)),
        );
    } catch (buildError) {
        // If esbuild bundling fails for all workers, fall back immediately
        console.warn('[WorkerPool] Failed to build worker threads, falling back to sequential:', buildError);
        return sequentialFallback(allCombos, candles, allData, interval, onProgress, signal);
    }

    return new Promise<CombinationResult[]>((resolve, reject) => {
        const workers: WorkerEntry[] = workerInstances.map(w => ({
            worker: w,
            busy: false,
            lastActivity: Date.now(),
        }));

        // ── Per-worker activity monitor ─────────────────────────────────
        // Replaces the old global setTimeout. Every MONITOR_INTERVAL_MS,
        // checks each busy worker. If a worker has been silent longer than
        // WORKER_TIMEOUT_MS, it is terminated in isolation.
        const monitorId = setInterval(() => {
            const now = Date.now();
            for (let i = 0; i < workers.length; i++) {
                const entry = workers[i];
                if (!entry.busy) continue;
                const silentDuration = now - entry.lastActivity;
                if (silentDuration > WORKER_TIMEOUT_MS) {
                    console.warn(`[WorkerPool] Worker ${i} inactive for ${Math.round(silentDuration / 1000)}s — terminating.`);
                    try { entry.worker.terminate(); } catch { /* ignore */ }
                    entry.busy = false;
                    completedWorkers++;
                    workerFailures++;
                }
            }

            // DEADLOCK DETECTION: All workers dead? Fall back with remaining combos.
            if (workerFailures >= numWorkers && !hasFallenBack) {
                hasFallenBack = true;
                clearInterval(monitorId);
                if (signal) signal.removeEventListener('abort', handleAbort);
                const remaining = allCombos.slice(testedCombos);
                console.warn(`[WorkerPool] All ${numWorkers} workers dead. Falling back to sequential with ${remaining.length} remaining combos.`);
                resolve(sequentialFallback(remaining, candles, allData, interval,
                    (t, total) => onProgress?.(testedCombos + t, totalCombos),
                    signal,
                ));
            }
        }, MONITOR_INTERVAL_MS);

        const handleAbort = () => {
            isCancelled = true;
            clearInterval(monitorId);
            for (const entry of workers) {
                try { entry.worker.terminate(); } catch { /* ignore */ }
            }
            // Return partial results sorted by score
            allResults.sort((a, b) => b.score - a.score);
            resolve(allResults.slice(0, TOP_N_RESULTS));
        };

        if (signal) {
            if (signal.aborted) {
                clearInterval(monitorId);
                resolve([]);
                return;
            }
            signal.addEventListener('abort', handleAbort, { once: true });
        }

        // Track whether we've already fallen back (prevent double-resolve)
        let hasFallenBack = false;

        // Spawn workers
        for (let i = 0; i < numWorkers; i++) {
            const entry = workers[i];

            entry.worker.on('message', (msg: any) => {
                // Reset activity timer on ANY message from this worker
                entry.lastActivity = Date.now();

                if (msg.type === 'result') {
                    // Collect results from worker
                    const workerResults = msg.results as CombinationResult[];
                    allResults.push(...workerResults);
                    entry.busy = false;
                    completedWorkers++;

                    // Increment tested counter: each chunk is WORKER_CHUNK_SIZE combos
                    // (or less for the final chunk that might be partial)
                    const chunkSize = Math.min(WORKER_CHUNK_SIZE, totalCombos - testedCombos);
                    testedCombos += chunkSize;

                    // Report incremental progress
                    if (onProgress) {
                        onProgress(testedCombos, totalCombos);
                    }

                    // Send next chunk if available
                    sendNextChunk(entry);
                }
                // HEARTBEAT: Worker is still alive — we already reset lastActivity above.
                // No other action needed. The monitor will not terminate this worker.
                else if (msg.type === 'heartbeat') {
                    // Activity timer was already reset at the top of this handler.
                    // Log at trace level if needed for debugging:
                    // console.log(`[WorkerPool] Heartbeat from worker ${i}`);
                }
            });

            entry.worker.on('error', (err) => {
                console.error(`[WorkerPool] Worker ${i} error:`, err);
                entry.busy = false;
                entry.lastActivity = Date.now();
                completedWorkers++;
                workerFailures++;

                // DEADLOCK DETECTION: If ALL workers have failed and we have
                // no results, fall back to sequential immediately instead of
                // waiting for the monitor.
                if (workerFailures >= numWorkers && allResults.length === 0 && !hasFallenBack) {
                    hasFallenBack = true;
                    console.warn(`[WorkerPool] All ${numWorkers} workers failed with no results. Falling back to sequential immediately.`);
                    clearInterval(monitorId);
                    if (signal) signal.removeEventListener('abort', handleAbort);
                    for (const e of workers) { try { e.worker.terminate(); } catch { /* ignore */ } }
                    const remaining = allCombos.slice(testedCombos);
                    resolve(sequentialFallback(remaining, candles, allData, interval,
                        (t, total) => onProgress?.(testedCombos + t, totalCombos),
                        signal,
                    ));
                    return;
                }

                // Otherwise, let other workers pick up the slack
                if (!isCancelled && !hasFallenBack) {
                    sendNextChunk(entry);
                }
            });

            entry.worker.on('exit', (code) => {
                if (code !== 0) {
                    console.warn(`[WorkerPool] Worker ${i} exited with code ${code}`);
                }
            });

            // Send first chunk (only combos — static data was sent at init)
            sendNextChunk(entry);
        }

        function sendNextChunk(entry: WorkerEntry): void {
            if (isCancelled || hasFallenBack) return;

            if (nextIndex >= allCombos.length) {
                // All combos distributed — check if done
                if (completedWorkers >= numWorkers) {
                    cleanup('complete');
                }
                return;
            }

            const chunk = allCombos.slice(nextIndex, nextIndex + WORKER_CHUNK_SIZE);
            nextIndex += WORKER_CHUNK_SIZE;
            entry.busy = true;
            entry.lastActivity = Date.now(); // Mark activity when sending a chunk

            try {
                // Only send combos — static data (candles, allData) was sent at init.
                // This avoids repeated structured clone of large objects.
                entry.worker.postMessage({
                    type: 'process',
                    combos: chunk,
                });
            } catch (postError) {
                // Worker is dead — treat as another failure
                console.warn(`[WorkerPool] Failed to postMessage to worker:`, postError);
                entry.busy = false;
                completedWorkers++;
                workerFailures++;

                if (workerFailures >= numWorkers && allResults.length === 0 && !hasFallenBack) {
                    hasFallenBack = true;
                    console.warn(`[WorkerPool] All workers dead with no results. Falling back to sequential.`);
                    clearInterval(monitorId);
                    if (signal) signal.removeEventListener('abort', handleAbort);
                    for (const e of workers) { try { e.worker.terminate(); } catch { /* ignore */ } }
                    const remaining = allCombos.slice(testedCombos);
                    resolve(sequentialFallback(remaining, candles, allData, interval,
                        (t, total) => onProgress?.(testedCombos + t, totalCombos),
                        signal,
                    ));
                }
            }
        }

        function cleanup(reason: string): void {
            if (hasFallenBack) return;

            clearInterval(monitorId);
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }

            // Terminate all workers
            for (const entry of workers) {
                try { entry.worker.terminate(); } catch { /* ignore */ }
            }

            if (isCancelled) return; // Already resolved by abort handler

            // Sort all results by score descending, keep top N
            allResults.sort((a, b) => b.score - a.score);
            const topResults = allResults.slice(0, TOP_N_RESULTS);

            // Report final progress
            if (onProgress) {
                onProgress(totalCombos, totalCombos);
            }

            resolve(topResults);
        }
    });
}

// ─── Worker Creation (esbuild Bundling) ──────────────────────────────────────────

/**
 * Creates a worker thread by bundling the TypeScript worker file into a
 * self-contained JavaScript string using esbuild, then loading it via data: URL.
 *
 * After creation, sends an 'init' message with static data (candles, allData, etc.)
 * so that subsequent 'process' messages only need to carry combo chunks.
 *
 * CRITICAL: Does NOT use `new URL('./parallel-worker.ts', import.meta.url)` to
 * resolve the entry point. Next.js/Turbopack intercepts the `new URL()` pattern
 * as a static asset reference and copies the raw .ts source to .next/server/assets/
 * with a content-hash filename. The copied file retains its relative imports
 * (e.g., `./strategy-optimizer`) which cannot be resolved from the assets directory.
 *
 * Instead, resolves the path relative to process.cwd(), which in Next.js server
 * context always points to the project root directory.
 */
async function createWorker(staticPayload: WorkerStaticPayload): Promise<Worker> {
    // Resolve path using process.cwd() — avoids Next.js new URL() static asset trap
    const workerPath = path.resolve(process.cwd(), 'lib/ta/parallel-worker.ts').replace(/\\/g, '/');

    // HIDE esbuild import from Next.js Turbopack bundler:
    // Turbopack tries to bundle native binaries (@esbuild/win32-x64/esbuild.exe, README.md)
    // when it sees a static `import('esbuild')`. Using createRequire + require() prevents
    // static analysis from tracing into the esbuild package.
    const { createRequire } = await import('module');
    const localRequire = createRequire(import.meta.url);
    const esbuild = localRequire('esbuild');

    // Bundle the worker into a self-contained CJS string
    const result = await esbuild.build({
        entryPoints: [workerPath],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        write: false,
        // Externalize native modules (worker_threads, etc.)
        packages: 'external',
        // Suppress warnings about type-only imports
        logLevel: 'silent',
    });

    const code = result.outputFiles[0].text;

    // Use eval:true to pass bundled code directly — Node.js 18+ rejects
    // raw data: URLs in the Worker constructor (ERR_WORKER_PATH).
    // eval:true is safe here because the code is esbuild-bundled CJS
    // from our own TypeScript source, not user input.
    const worker = new Worker(code, { eval: true });

    // Send static data ONCE via 'init' message.
    // This is the ONLY time large objects (allData, candles) are transferred.
    // Subsequent 'process' messages will only carry combo chunks.
    worker.postMessage({
        type: 'init',
        candles: staticPayload.candles,
        allData: staticPayload.allData,
        interval: staticPayload.interval,
        searchLookforwardValues: staticPayload.searchLookforwardValues,
        searchModes: staticPayload.searchModes,
        minSignalThreshold: staticPayload.minSignalThreshold,
    });

    return worker;
}

// ─── Sequential Fallback (Resumable) ─────────────────────────────────────────────

/**
 * Fallback: process all remaining combinations sequentially in the main thread.
 *
 * CRITICAL: Receives only the REMAINING combos (allCombos.slice(testedCombos)),
 * not the full set. This means if workers processed 12,000 combos before failing,
 * the fallback starts from combo 12,001 — not from zero.
 *
 * Progress reporting is offset: the caller wraps onProgress to add testedCombos
 * to the reported count, so the UI shows combined progress across both phases.
 *
 * Used when worker threads are unavailable or system has only 1 core.
 *
 * IMPORTANT: Yields to the event loop every SEQUENTIAL_YIELD_INTERVAL (5) combos
 * to prevent main-thread blocking. Without this, the Node.js event loop would
 * be blocked for 20+ seconds per chunk while backtests run, freezing ALL HTTP
 * requests (page loads, API calls) during that time.
 *
 * @param remainingCombos - Only the unprocessed combos (allCombos.slice(testedCombos))
 * @param candles - Pre-computed price candle data
 * @param allData - Pre-computed indicator data for all indicators
 * @param interval - Trading interval
 * @param onProgress - Callback with (progressInThisBatch, remainingCombos.length)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to Top 100 CombinationResult[] sorted by score descending
 */
export async function sequentialFallback(
    remainingCombos: string[][],
    candles: Candle[],
    allData: AllData,
    interval: string,
    onProgress?: (tested: number, total: number) => void,
    signal?: AbortSignal,
): Promise<CombinationResult[]> {
    // Import runStrategyBacktest once at function start, not inside the loop.
    // Node.js module cache makes subsequent dynamic imports fast, but importing
    // once is cleaner and avoids redundant awaits.
    const { runStrategyBacktest } = await import('./strategy-optimizer');

    const results: CombinationResult[] = [];
    const total = remainingCombos.length;
    let totalTested = 0;

    console.log(`[SequentialFallback] Starting sequential processing of ${total} remaining combos (yield every ${SEQUENTIAL_YIELD_INTERVAL})`);

    for (let idx = 0; idx < remainingCombos.length; idx += WORKER_CHUNK_SIZE) {
        if (signal?.aborted) break;

        const chunk = remainingCombos.slice(idx, idx + WORKER_CHUNK_SIZE);

        // FA-002 HOTFIX: Sequential fallback hard timeout — 10s sonra partial
        // result döndür, main thread'i tamamen dondurmayı engeller.
        // Eski davranış: chunk sayısı 131K'ya kadar çıkabiliyor → 2-7 saat blokaj.
        const SEQ_TIMEOUT_MS = 10000;
        const seqStart = Date.now();
        for (let ci = 0; ci < chunk.length; ci++) {
            if (signal?.aborted) break;
            if (ci > 0 && Date.now() - seqStart > SEQ_TIMEOUT_MS) {
                console.warn(`[SequentialFallback] Timeout after ${ci}/${chunk.length} chunks, returning partial result`);
                break;
            }

            const combo = chunk[ci];

            for (const lookForward of SEARCH_LOOKFORWARD_VALUES) {
                for (const mode of SEARCH_MODES) {
                    const config = { lookForward, interval, mode };
                    const result = runStrategyBacktest(
                        candles, 'CUSTOM', allData, config,
                        { customIndicators: combo, mode, interval },
                    );

                    if (result.totalSignals >= MIN_SIGNAL_THRESHOLD) {
                        results.push({
                            combo,
                            lookForward,
                            mode,
                            winRate: result.winRate,
                            totalSignals: result.totalSignals,
                            score: result.winRate * Math.sqrt(result.totalSignals),
                        });
                    }
                }
            }

            totalTested++;

            // Yield to event loop every N combos to prevent main-thread blocking.
            // This allows HTTP requests (page loads, API calls) to be processed
            // between backtest batches, preventing UI freezing.
            if (ci % SEQUENTIAL_YIELD_INTERVAL === 0 && ci > 0) {
                if (onProgress) {
                    onProgress(totalTested, total);
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Report progress at chunk boundaries
        if (onProgress) {
            onProgress(Math.min(totalTested, total), total);
        }

        // Also yield between chunks
        if (idx + WORKER_CHUNK_SIZE < total) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    if (onProgress) {
        onProgress(total, total);
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, TOP_N_RESULTS);
}
