// lib/ta/parallel-worker.ts — Worker Thread for Combinatorial Search
// This file runs in a separate V8 isolate (worker_thread).
// It receives an 'init' message with static data (candles, allData, etc.)
// once at startup, then 'process' messages with only the combo chunks.
//
// CRITICAL: Static data (allData, candles) is sent ONCE per worker lifetime,
// avoiding repeated structured clone overhead for every chunk.
//
// V8 JIT WARMUP: After init, runs a small batch of synthetic backtests to
// trigger V8's TurboFan JIT compilation on hot-path functions (runStrategyBacktest,
// getIndicatorSignal, hasFreshCrossover, and all 17 indicator signal functions).
// Without warmup, the first real chunk of 50 combos × 12 backtests = 600 calls
// runs entirely in V8 Ignition interpreter mode, taking ~197s instead of ~19s
// after JIT compilation — exceeding the worker timeout.
//
// HEARTBEAT: During long processing, the worker periodically sends a 'heartbeat'
// message to the pool to signal it is still alive. This allows the pool to
// distinguish between "worker is slow" and "worker has crashed/hung".
// The pool uses heartbeat reception to reset per-worker activity timers.

import { parentPort } from 'worker_threads';
import type { Candle } from './backtest';
import type { AllData, StrategyBacktestConfig } from './strategy-optimizer';
import { runStrategyBacktest } from './strategy-optimizer';
import type { CombinationResult } from './discovery-types';
import type { StrategyMode } from './types';

// ─── State: Static Data Stored Once at Init ─────────────────────────────────

/** Static configuration received once via 'init' message. */
interface StaticContext {
    candles: Candle[];
    allData: AllData;
    interval: string;
    searchLookforwardValues: number[];
    searchModes: StrategyMode[];
    minSignalThreshold: number;
}

/** Module-level store — populated by 'init', read by 'process'. */
let staticCtx: StaticContext | null = null;

// ─── Message Protocols ────────────────────────────────────────────────────────

/** First message from pool: stores static data once per worker lifetime. */
interface WorkerInit {
    type: 'init';
    candles: Candle[];
    allData: AllData;
    interval: string;
    searchLookforwardValues: number[];
    searchModes: StrategyMode[];
    minSignalThreshold: number;
}

/** Subsequent messages: only the combo chunk (no allData/candles copy). */
interface WorkerInput {
    type: 'process';
    /** Chunk of indicator combinations to process. */
    combos: string[][];
}

interface WorkerResult {
    type: 'result';
    /** All results from this chunk, sorted by score descending. */
    results: CombinationResult[];
}

interface WorkerHeartbeat {
    type: 'heartbeat';
}

type WorkerMessage = WorkerInit | WorkerInput;
type MainMessage = WorkerResult | WorkerHeartbeat;

// ─── Heartbeat Configuration ─────────────────────────────────────────────────

/**
 * How many combos to process before sending a heartbeat to the pool.
 * With chunk size 50 and each combo producing 12 backtests (6 lookForward × 2
 * modes), heartbeating every 10 combos means ~120 backtests between heartbeats.
 * At ~19 seconds per chunk (50 combos), that's a heartbeat every ~3.8 seconds —
 * fast enough for the pool to detect a stuck worker within seconds.
 */
const HEARTBEAT_INTERVAL = 10;

// ─── V8 JIT Warmup ────────────────────────────────────────────────────────────

/**
 * Warmup indicators that are always present in allData, chosen to exercise
 * different switch case positions (early, middle, late) and data access patterns
 * (direct array, map lookup, series-based, BBPoint-based) to trigger JIT
 * compilation across the full code surface.
 */
const WARMUP_COMBOS: string[][] = [
    ['rsi', 'cci'],           // #1, #2 in DISCOVERY_POOL — direct series access
    ['macd', 'wavetrend'],    // #6, #3 — map lookup + cross detection
    ['bb', 'alma'],           // #17, #16 — BBPoint + candle-based signals
];

/**
 * Subset of lookForward values for warmup — uses min and median from the
 * full SEARCH_LOOKFORWARD_VALUES [5, 7, 10, 14, 21, 30].
 */
const WARMUP_LOOKFORWARDS = [5, 14];

/**
 * Runs a small batch of synthetic backtests immediately after init to trigger
 * V8's tiered JIT compilation (Ignition → Sparkplug → TurboFan) on all
 * hot-path functions before the first real chunk arrives.
 *
 * Without warmup, the FIRST chunk from the pool (50 combos × 6 lookForward × 2
 * modes = 600 backtests) runs entirely in V8 Ignition interpreter mode.
 * Each backtest loops through ~6,400 candles, calling getIndicatorSignal and
 * hasFreshCrossover for each of ~8.5 indicators on average — that's
 * ~7.7 million function calls in interpreter mode, taking ~197 seconds.
 *
 * After JIT compilation, the same workload takes ~19 seconds.
 *
 * The warmup runs 3 combos × 2 lookForward × 2 modes = 12 backtests.
 * Each backtest processes ~6,400 candles with 2-3 indicators, producing
 * ~153,600 calls to each of getIndicatorSignal and hasFreshCrossover —
 * well above V8's typical JIT threshold of ~100-200 hot function invocations.
 */
function jitWarmup(ctx: StaticContext): void {
    const { candles, allData, interval, searchModes } = ctx;

    for (const combo of WARMUP_COMBOS) {
        for (const lookForward of WARMUP_LOOKFORWARDS) {
            for (const mode of searchModes) {
                runStrategyBacktest(
                    candles,
                    'CUSTOM',
                    allData,
                    { lookForward, interval, mode },
                    { customIndicators: combo, mode, interval },
                );
            }
        }
    }
}

// ─── Main Worker Handler ──────────────────────────────────────────────────────

if (parentPort) {
    parentPort.on('message', async (input: WorkerMessage) => {
        // ── Init: store static data once, then run JIT warmup ──
        if (input.type === 'init') {
            // DEEP COPY: allData'yı parent'tan gelen referans olarak değil,
            // tamamen izole bir kopyası olarak sakla. runStrategyBacktest
            // regimeData gibi iç alanları mutate edebilir — shared reference
            // durumunda worker'lar arası veri bozulması (corruption) olur.
            // structuredClone modern Node.js (17+) desteği ile güvenli deep copy.
            let allDataCopy: AllData;
            try {
                allDataCopy = structuredClone(input.allData);
            } catch (cloneErr) {
                // Fallback: structuredClone desteklenmiyorsa JSON round-trip
                // (Date/Map/Set/Decimal128 kaybolabilir — allData'da bunlar yok)
                allDataCopy = JSON.parse(JSON.stringify(input.allData));
            }

            const ctx: StaticContext = {
                candles: input.candles,
                allData: allDataCopy,
                interval: input.interval,
                searchLookforwardValues: input.searchLookforwardValues,
                searchModes: input.searchModes,
                minSignalThreshold: input.minSignalThreshold,
            };
            staticCtx = ctx;

            // V8 JIT WARMUP: Run synthetic backtests to pre-compile hot functions.
            // This adds ~2-3 seconds to init time but prevents the first real chunk
            // from timing out due to interpreter-mode slowness (~197s vs ~19s).
            jitWarmup(ctx);

            return; // Wait for 'process' messages
        }

        // ── Process: use stored static data, with periodic heartbeat ──
        if (input.type === 'process') {
            if (!staticCtx) {
                console.warn('[ParallelWorker] Received process before init — ignoring.');
                return;
            }

            const { combos } = input;
            const {
                candles,
                allData,
                interval,
                searchLookforwardValues,
                searchModes,
                minSignalThreshold,
            } = staticCtx;

            const results: CombinationResult[] = [];
            let tested = 0;

            for (const combo of combos) {
                for (const lookForward of searchLookforwardValues) {
                    for (const mode of searchModes) {
                        const config: StrategyBacktestConfig = {
                            lookForward,
                            interval,
                            mode,
                        };

                        const result = runStrategyBacktest(
                            candles,
                            'CUSTOM',
                            allData,
                            config,
                            {
                                customIndicators: combo,
                                mode,
                                interval,
                            },
                        );

                        // Filter: require minimum signal count for statistical validity
                        if (result.totalSignals >= minSignalThreshold) {
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
                tested++;

                // HEARTBEAT: Every HEARTBEAT_INTERVAL combos, send a heartbeat
                // to the pool and yield to the event loop. This allows the
                // heartbeat message to be delivered and the pool to detect
                // that this worker is still alive.
                //
                // Without heartbeat, the pool only knows a worker is alive
                // when it sends back a full result. For long chunks (complex
                // combos with many indicators), this could take 30+ seconds.
                // The heartbeat tells the pool "I'm still working" so the
                // per-worker activity timer can be reset.
                if (tested % HEARTBEAT_INTERVAL === 0 && parentPort) {
                    parentPort.postMessage({ type: 'heartbeat' } as MainMessage);
                    // Yield to event loop so the heartbeat message is actually
                    // delivered and processed by the pool before we continue.
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // Sort results by score descending before sending back
            results.sort((a, b) => b.score - a.score);

            if (parentPort) {
                parentPort.postMessage({
                    type: 'result',
                    results,
                } as MainMessage);
            }
        }
    });
} else {
    console.warn('[ParallelWorker] Warning: No parentPort available — worker may not be running in a thread.');
}
