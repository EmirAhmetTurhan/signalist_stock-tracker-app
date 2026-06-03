'use server';

import { INDICATOR_DETAILS } from "@/lib/constants/indicator-categories";
import { getCandlesForInterval } from "@/lib/actions/finnhub.actions";
import { findBestParameter, OPTIMIZABLE_INDICATORS } from "@/lib/ta/optimizer";
// SPRINT 3: timeframe-limits.ts silindi, inline yıl->gün dönüşümü kullanılıyor.
import type { Candle } from "@/lib/ta/backtest";

export interface OptimizationResult {
    key: string;
    bestVal: number;
    bestWinRate: number;
    paramName: string;
}

/**
 * Synchronously runs parameter optimization for all optimizable indicators.
 * Fetches candles once, then brute-forces the best parameter values.
 * Called by the TA page server component when ?optimize=1 is detected.
 */
export async function triggerOptimization(
    symbol: string,
    indicators: string[],
    interval: string,
    years?: number
): Promise<OptimizationResult[]> {
    if (!symbol || indicators.length === 0) {
        return [];
    }

    // Filter only optimizable indicators
    const optimizable = indicators.filter((key) => {
        const info = INDICATOR_DETAILS.find((i) => i.key === key);
        return info?.optimizable === true;
    });

    if (optimizable.length === 0) {
        return [];
    }

    // SPRINT 3: inline yıl->gün dönüşümü
    const days = (years ?? 1) * 365;
    const rawCandles = await getCandlesForInterval(symbol, interval, days);

    if (!rawCandles || rawCandles.length === 0) {
        console.error(`[optimize] No candle data for ${symbol} (${interval}, ${days} days)`);
        return [];
    }

    // Convert to Candle[] (CandleDataPoint is compatible with Candle)
    const candles = rawCandles as unknown as Candle[];

    const results: OptimizationResult[] = [];

    for (const indicator of optimizable) {
        try {
            const name = indicator.toUpperCase();
            const config = OPTIMIZABLE_INDICATORS[name];
            if (!config) {
                console.warn(`[optimize] ${indicator} has no optimizer entry, skipping`);
                continue;
            }

            const result = findBestParameter(name, candles);
            if (result && result.bestVal !== -1) {
                results.push({
                    key: indicator,
                    bestVal: result.bestVal,
                    bestWinRate: Math.round(result.bestWinRate * 100) / 100,
                    paramName: config.param,
                });
            }
        } catch (err) {
            console.error(`[optimize] Failed to optimize ${indicator}:`, err);
        }
    }

    return results;
}
