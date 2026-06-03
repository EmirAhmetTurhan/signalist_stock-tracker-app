'use server';

import { optimizeStrategyParams } from '@/lib/ta/strategy-optimizer';
import type { AllData, StrategyBacktestConfig, StrategyOptimizationConfig, StrategyOptimizationResult } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/backtest';

/**
 * Server action: Optimize strategy parameters (lookForward + indicator params).
 * Takes pre-computed candles + AllData (already computed client-side).
 * Returns the best params found, win rate, and round-by-round results.
 */
export async function optimizeStrategyAction(
    candles: Candle[],
    allData: AllData,
    indicatorKeys: string[],
    options?: {
        lookForwardRange?: [number, number];
        convergenceRounds?: number;
        interval?: string;
        mode?: 'all' | 'majority';
    }
): Promise<StrategyOptimizationResult> {
    if (!candles || candles.length === 0 || !allData) {
        return {
            bestParams: { lookForward: 14 },
            bestWinRate: 0,
            iterations: 0,
            roundResults: [],
        };
    }

    const config: StrategyOptimizationConfig = {
        indicators: indicatorKeys,
        lookForwardRange: options?.lookForwardRange ?? [5, 30],
        convergenceRounds: options?.convergenceRounds ?? 1,
        interval: options?.interval ?? '1d',
        mode: options?.mode ?? 'all',
    };

    try {
        const result = optimizeStrategyParams(candles, allData, config);
        return result;
    } catch (error) {
        console.error('[optimize-strategy] Failed to optimize strategy params:', error);
        return {
            bestParams: { lookForward: 14 },
            bestWinRate: 0,
            iterations: 0,
            roundResults: [],
        };
    }
}
