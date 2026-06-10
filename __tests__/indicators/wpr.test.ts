import { describe, it, expect } from 'vitest';
import { computeWPR } from '@/lib/indicators/wpr';

const makeCandles = (prices: { high: number; low: number; close: number }[]) =>
    prices.map((p, i) => ({ time: i + 1, high: p.high, low: p.low, close: p.close }));

describe('computeWPR', () => {
    it('returns empty array for empty input', () => {
        expect(computeWPR([])).toEqual([]);
    });

    it('returns full-length array with defined values after warmup', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({ high: 100 + i, low: 90 + i, close: 95 + i }))
        );
        const result = computeWPR(candles, 14);
        // Full-length array (30) with first 13 entries undefined (warmup)
        expect(result.length).toBe(30);
        expect(result[0].value).toBeUndefined();
        expect(result[13].value).toBeDefined();
    });

    it('WPR is between 0 and -100 after warmup', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 105, low: 95, close: 100 }))
        );
        const result = computeWPR(candles, 14);
        // Skip undefined warmup entries (first 13)
        result.filter(p => p.value !== undefined).forEach(p => {
            expect(p.value).toBeGreaterThanOrEqual(-100);
            expect(p.value).toBeLessThanOrEqual(0);
        });
    });

    it('WPR is near 0 in strong uptrend (close near high)', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({ high: 100, low: 80, close: 98 }))
        );
        const result = computeWPR(candles, 14);
        // close is near high, so highestHigh - close is small → WPR near 0
        const lastValues = result.slice(-5);
        lastValues.forEach(p => expect(p.value).toBeGreaterThan(-30));
    });

    it('WPR is near -100 in strong downtrend (close near low)', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({ high: 100, low: 80, close: 82 }))
        );
        const result = computeWPR(candles, 14);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => expect(p.value).toBeLessThan(-70));
    });

    it('different period produces different WPR values', () => {
        const candles = makeCandles(
            Array.from({ length: 40 }, (_, i) => ({ high: 100 + i, low: 90 + i, close: 95 + i }))
        );
        const result7 = computeWPR(candles, 7);
        const result14 = computeWPR(candles, 14);
        // Both return full-length arrays, but different first-defined indices
        expect(result7.length).toBe(40);
        expect(result14.length).toBe(40);
        const firstDefined7 = result7.findIndex(p => p.value !== undefined);
        const firstDefined14 = result14.findIndex(p => p.value !== undefined);
        expect(firstDefined7).toBeLessThan(firstDefined14);
    });

    it('returned values have correct time property', () => {
        const candles = makeCandles(
            Array.from({ length: 20 }, (_, i) => ({ high: 100, low: 90, close: 95 }))
        );
        const result = computeWPR(candles, 14);
        // With full-length array, first defined entry is at index 13 (0-based), time=14
        expect(result.length).toBe(20);
        expect(result[0].time).toBe(1);
        expect(result[0].value).toBeUndefined();
        expect(result[13].value).toBeDefined();
        expect(result[13].time).toBe(14);
    });
});
