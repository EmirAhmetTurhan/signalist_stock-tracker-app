'use server';

import { optimizeStrategyParams, mapComputedToAllData } from '@/lib/ta/strategy-optimizer';
import type { StrategyOptimizationConfig, StrategyOptimizationResult } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/simulation/backtest';
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from '@/lib/ta/compute';
import { DEFAULT_PARAMS } from '@/lib/constants/indicators';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import type { Timeframe, CandleInput, IndicatorParams } from '@/lib/ta/types';

/**
 * Server action: Optimize strategy parameters (lookForward + indicator params).
 * Fetches candles and computes indicators server-side for payload optimization and security.
 */
export async function optimizeStrategyAction(
    symbol: string,
    indicatorKeys: string[],
    options?: {
        lookForwardRange?: [number, number];
        convergenceRounds?: number;
        interval?: string;
        mode?: 'all' | 'majority';
        strategyName?: string;
    }
): Promise<StrategyOptimizationResult> {
    // ─── Better Auth Security Gate ──────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    if (!symbol || !indicatorKeys || indicatorKeys.length === 0) {
        return {
            bestParams: { lookForward: 14 },
            bestWinRate: 0,
            iterations: 0,
            roundResults: [],
        };
    }

    try {
        const interval = (options?.interval ?? '1d') as Timeframe;
        // Fetch up to 10 years of candles server-side
        const rawCandles = await getCandlesForInterval(symbol, interval, 3650);
        if (!rawCandles || rawCandles.length === 0) {
            throw new Error(`No candles found for symbol ${symbol}`);
        }

        const candles: Candle[] = rawCandles.map(c => ({
            time: Number(c.time),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume ?? 0
        }));

        // Compute indicator series server-side using default parameters as baseline
        const activeIndicators = new Set<string>();
        if (options?.strategyName === 'RSI_CCI_WT') {
            activeIndicators.add('rsi');
            activeIndicators.add('cci');
            activeIndicators.add('wavetrend');
        } else {
            indicatorKeys.forEach(ind => activeIndicators.add(ind));
        }

        const candleInputs: CandleInput[] = candles.map(c => ({
            time: Number(c.time),
            open: c.open ?? c.close,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume ?? 0
        }));
        const computed = computeIndicators(candleInputs, activeIndicators, DEFAULT_PARAMS);
        const allData = mapComputedToAllData(computed);

        const config: StrategyOptimizationConfig = {
            indicators: indicatorKeys,
            lookForwardRange: options?.lookForwardRange ?? [5, 30],
            convergenceRounds: options?.convergenceRounds ?? 1,
            interval,
            mode: options?.mode ?? 'all',
            strategyName: options?.strategyName,
        };

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
