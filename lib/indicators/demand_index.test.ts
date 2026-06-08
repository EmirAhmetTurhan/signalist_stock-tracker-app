import { describe, it, expect } from 'vitest';
import { computeDemandIndex } from './demand_index';

const makeCandles = (bars: { high: number; low: number; close: number; open: number; volume: number }[]) =>
    bars.map((b, i) => ({ time: i + 1, ...b }));

describe('computeDemandIndex', () => {
    it('returns empty array for empty input', () => {
        expect(computeDemandIndex([])).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 105, low: 95, close: 100, open: 99, volume: 1000 }))
        );
        const result = computeDemandIndex(candles);
        expect(result.length).toBe(30);
    });

    it('returns defined values after warmup, undefined before', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 105, low: 95, close: 100, open: 99, volume: 1000 }))
        );
        const result = computeDemandIndex(candles, 13, 8);
        // First (length + smooth - 1) ≈ 20 bars may be undefined during warmup
        const firstDefined = result.findIndex(p => p.value !== undefined);
        expect(firstDefined).toBeGreaterThan(0);
        // After warmup, values should be defined
        result.slice(-5).forEach(p => expect(p.value).toBeDefined());
    });

    it('DI > 1 in strong accumulation (bullish) — demand exceeds supply', () => {
        // Strong bullish: close near high, far from low → buy pressure > sell pressure
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({
                high: 100 + i + 5,
                low: 100 + i - 5,
                close: 100 + i + 4,  // close near high → strong buy pressure
                open: 100 + i,
                volume: 1000,
            }))
        );
        const result = computeDemandIndex(candles, 10, 5);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => {
            // James Sibbet ratio: demand/supply > 1 when bullish
            expect(p.value).toBeGreaterThan(1);
        });
    });

    it('DI < 1 in strong distribution (bearish) — supply exceeds demand', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({
                high: 200 - i + 5,
                low: 200 - i - 5,
                close: 200 - i - 4,  // close near low → strong sell pressure
                open: 200 - i,
                volume: 1000,
            }))
        );
        const result = computeDemandIndex(candles, 10, 5);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => {
            // James Sibbet ratio: demand/supply < 1 when bearish
            // Both BP and SP are positive, so DI is always > 0
            expect(p.value).toBeGreaterThan(0);
            expect(p.value).toBeLessThan(1);
        });
    });

    it('different length and smooth periods produce different values', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({
                high: 100 + i,
                low: 90 + i,
                close: 95 + i + (i % 3 - 1),
                open: 95 + i,
                volume: 1000,
            }))
        );
        const resultA = computeDemandIndex(candles, 5, 3);
        const resultB = computeDemandIndex(candles, 10, 5);
        // Only compare bars where both are defined (skip warmup)
        const definedA = resultA.filter(p => p.value !== undefined) as { time: number; value: number }[];
        const definedB = resultB.filter(p => p.value !== undefined) as { time: number; value: number }[];
        const sumA = definedA.slice(-10).reduce((s, p) => s + p.value, 0);
        const sumB = definedB.slice(-10).reduce((s, p) => s + p.value, 0);
        expect(Math.abs(sumA - sumB)).toBeGreaterThan(0);
    });

    it('handles zero open price gracefully', () => {
        const candles = makeCandles([
            { high: 105, low: 95, close: 100, open: 0, volume: 1000 },
            { high: 106, low: 96, close: 102, open: 0, volume: 1000 },
        ]);
        // Should not throw
        expect(() => computeDemandIndex(candles)).not.toThrow();
    });
});
