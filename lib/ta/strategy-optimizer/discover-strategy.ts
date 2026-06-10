// lib/ta/strategy-optimizer/discover-strategy.ts
// Ported from monolith strategy-optimizer.ts

import type { Candle } from '../simulation/backtest';
import { geneticOptimize, localRefine, MIN_SIGNAL_THRESHOLD, MAX_INDICATORS } from '../optimization/ga-optimizer';
import { DISCOVERY_POOL } from '../registry/indicator-registry';
import { runStrategyBacktest } from './run-backtest';
import type { StrategyMode } from '../types';

import type {
    AllData,
    DiscoveryResult,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate all C(n,k) combinations of an array */
function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = combinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

const MAX_COMBOS_TO_SCREEN = 500;
const SCREEN_TOP_N = 50;
const SCREEN_LOOKFORWARD_VALUES = [7, 14, 21];

/**
 * @deprecated Use the new deep discovery pipeline instead.
 * Kept for backward compatibility with existing UI.
 */
export async function discoverStrategy(
    candles: Candle[],
    allData: AllData,
    options: {
        indicatorPool?: string[];
        minIndicators?: number;
        maxIndicators?: number;
        interval?: string;
        mode?: StrategyMode;
        topN?: number;
    } = {}
): Promise<DiscoveryResult> {
    const pool = options.indicatorPool ?? DISCOVERY_POOL;
    const minN = options.minIndicators ?? 2;
    const maxN = options.maxIndicators ?? Math.min(pool.length, MAX_INDICATORS);
    const interval = options.interval ?? '1d';
    const mode = options.mode ?? 'all';
    const topN = options.topN ?? 5;

    // ── Phase 1: Generate combinations ──
    let allCombos: string[][] = [];
    for (let n = minN; n <= maxN; n++) {
        const combos = combinations(pool, n);
        allCombos.push(...combos);
    }

    if (allCombos.length > MAX_COMBOS_TO_SCREEN) {
        const sampled: string[][] = [];
        const perN = Math.floor(MAX_COMBOS_TO_SCREEN / (maxN - minN + 1));
        for (let n = minN; n <= maxN; n++) {
            const combosN = combinations(pool, n);
            const shuffled = [...combosN].sort(() => Math.random() - 0.5);
            sampled.push(...shuffled.slice(0, perN));
        }
        allCombos = sampled.slice(0, MAX_COMBOS_TO_SCREEN);
    }

    // ── Phase 2: Quick-screen with multiple lookForward values ──
    interface ScreenEntry {
        indicators: string[];
        winRate: number;
        totalSignals: number;
    }
    const screened: ScreenEntry[] = [];

    const phase2StartTime = Date.now();
    const PHASE2_TIMEOUT_MS = 5000;
    let phase2Processed = 0;
    for (const combo of allCombos) {
        if (phase2Processed > 0 && Date.now() - phase2StartTime > PHASE2_TIMEOUT_MS) {
            console.warn(`[Phase2] Timeout: ${phase2Processed}/${allCombos.length} combos tested, returning partial. Remaining combos will be explored by Phase 3 (GA).`);
            break;
        }
        phase2Processed++;
        let bestResult = { winRate: 0, totalSignals: 0 };
        for (const lf of SCREEN_LOOKFORWARD_VALUES) {
            const result = runStrategyBacktest(candles, 'CUSTOM', allData, {
                lookForward: lf,
                interval,
                mode,
            }, {
                customIndicators: combo,
                mode,
                interval,
            });
            if (result.winRate > bestResult.winRate) {
                bestResult = { winRate: result.winRate, totalSignals: result.totalSignals };
            }
        }
        screened.push({
            indicators: combo,
            winRate: bestResult.winRate,
            totalSignals: bestResult.totalSignals,
        });
    }

    const viable = screened.filter(e => e.totalSignals >= MIN_SIGNAL_THRESHOLD);
    viable.sort((a, b) => (b.winRate * Math.sqrt(b.totalSignals)) - (a.winRate * Math.sqrt(a.totalSignals)));
    const topScreen = viable.slice(0, SCREEN_TOP_N);

    // ── Phase 3: Genetic Algorithm ──
    const gaPopulation = await geneticOptimize(candles, allData, topScreen.map(e => ({
        indicators: e.indicators,
        winRate: e.winRate,
        totalSignals: e.totalSignals,
        bestLookForward: undefined,
    })), {
        interval,
        mode,
    });

    // ── Phase 4: Local Refinement ──
    let discovered = localRefine(gaPopulation, candles, allData, interval, mode, topN);

    discovered.sort((a, b) => b.winRate - a.winRate);
    discovered.forEach((ds, idx) => { ds.rank = idx + 1; });

    const best = discovered.length > 0 ? discovered[0] : {
        indicators: [], params: {}, winRate: 0, totalSignals: 0, rank: 1,
    };

    return {
        best,
        all: discovered.slice(0, topN),
        totalCombinationsTested: allCombos.length,
        poolSize: pool.length,
    };
}
