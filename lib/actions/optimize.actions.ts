import { INDICATOR_DETAILS } from "@/lib/constants/indicator-categories";
import { getCandlesForInterval } from "@/lib/actions/finnhub.actions";
import { findBestParameter, OPTIMIZABLE_INDICATORS } from "@/lib/ta/optimizer";
// SPRINT 3: timeframe-limits.ts silindi, inline yıl->gün dönüşümü kullanılıyor.
import type { Candle } from "@/lib/ta/types";

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
    years?: number,
    toTimestamp?: number
): Promise<OptimizationResult[]> {
    console.log(`[Server Action] triggerOptimization called for ${symbol} - indicators: ${indicators.join(", ")}`);
    console.time(`[Server Action] triggerOptimization: ${symbol}`);
    if (!symbol || indicators.length === 0) {
        console.timeEnd(`[Server Action] triggerOptimization: ${symbol}`);
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

    // BUGFIX: match the TA page default of 10 years (3650 days).
    // Previously defaulted to 1 year (365 days) while the page used 3650,
    // causing optimized params found on 1yr to perform poorly on the full 10yr dataset.
    // Cap at 3650 to stay within Finnhub API limits.
    const days = Math.min((years ?? 10) * 365, 3650);
    const rawCandles = await getCandlesForInterval(symbol, interval, days, toTimestamp);

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

            const result = findBestParameter(name, candles, { lookForward: 14, interval });
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

    console.timeEnd(`[Server Action] triggerOptimization: ${symbol}`);
    return results;
}
