/**
 * Timeframe fixture data — synthetic candle patterns for all 3 timeframes.
 *
 * Each timeframe uses the same base price pattern (oscillating sine-wave)
 * but with different bar spacing to simulate realistic timeframe differences.
 *
 * Base price pattern: sinusoidal oscillation around 100 with amplitude 20,
 * trending slightly upward over time. Volume follows price changes.
 *
 * Generated candle counts are sufficient for the longest warmup period
 * across all 17 indicators (~50 bars for SMI with longLen=20 + signal smoothing).
 */

import type { CandleInput } from '@/lib/ta/types';

export type TimeframeId = '1d' | '4h';

export interface TimeframeFixture {
    id: TimeframeId;
    label: string;
    barSeconds: number;
    description: string;
    /** Minimum required bars for full indicator warmup */
    minBars: number;
    candles: CandleInput[];
}

/**
 * Generate synthetic candle data using a sinusoidal price pattern.
 * @param barCount - Number of bars to generate
 * @param baseTime - Starting UNIX timestamp
 * @param barSeconds - Seconds between bars (e.g., 86400 for daily)
 * @param basePrice - Center price
 * @param amplitude - Oscillation amplitude
 * @param trend - Price trend per cycle (fraction of amplitude)
 * @param noise - Random noise fraction (0 = no noise)
 */
function generateCandles(
    barCount: number,
    baseTime: number,
    barSeconds: number,
    basePrice = 100,
    amplitude = 20,
    trend = 5,
    noise = 0,
): CandleInput[] {
    const candles: CandleInput[] = [];
    const cycleBars = Math.max(Math.round(barCount / 3), 20); // ~3 full cycles

    for (let i = 0; i < barCount; i++) {
        const angle = (i / cycleBars) * Math.PI * 2;
        const trendOffset = (i / barCount) * trend;
        const mid = basePrice + trendOffset + Math.sin(angle) * amplitude * 0.5;
        const halfRange = amplitude * 0.5 + Math.abs(Math.sin(angle)) * amplitude * 0.3;

        const open = mid - halfRange * 0.3 + (noise > 0 ? (Math.random() - 0.5) * noise * amplitude : 0);
        const close = mid + halfRange * 0.3 + (noise > 0 ? (Math.random() - 0.5) * noise * amplitude : 0);
        const high = Math.max(open, close) + halfRange * 0.4;
        const low = Math.min(open, close) - halfRange * 0.4;

        candles.push({
            time: baseTime + i * barSeconds,
            open: Math.max(open, 1),
            high: Math.max(high, Math.max(open, close) + 0.01),
            low: Math.max(Math.min(low, Math.min(open, close) - 0.01), 0.01),
            close: Math.max(close, 1),
            volume: Math.round(Math.abs(close - open) * 10000 + 50000),
        });
    }

    return candles;
}

// ─── Bar seconds for each timeframe ────────────────────────────────────────
const SECONDS = {
    '4h': 14400,
    '1d': 86400,
} as const;

// Base timestamp: Jan 1, 2024 00:00 UTC
const BASE_TIME = 1704067200;

// ─── Fixture definitions ───────────────────────────────────────────────────
export const TIMEFRAME_FIXTURES: Record<TimeframeId, TimeframeFixture> = {
    '1d': {
        id: '1d',
        label: 'Daily',
        barSeconds: SECONDS['1d'],
        description: '365 daily bars — sinusoidal oscillation, 1-year span',
        minBars: 365,
        candles: generateCandles(365, BASE_TIME, SECONDS['1d'], 100, 20, 10),
    },
    '4h': {
        id: '4h',
        label: '4-Hour',
        barSeconds: SECONDS['4h'],
        description: '500 4h bars — sinusoidal oscillation, ~83 days',
        minBars: 500,
        candles: generateCandles(500, BASE_TIME, SECONDS['4h'], 100, 20, 8),
    },
};
