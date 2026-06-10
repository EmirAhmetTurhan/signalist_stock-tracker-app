import { describe, it, expect } from 'vitest';
import { computeCMF } from '@/lib/indicators/cmf';

const makeCandles = (bars: { high: number; low: number; close: number; volume: number }[]) =>
    bars.map((b, i) => ({ time: i + 1, ...b }));

describe('computeCMF', () => {
    it('returns empty array for empty input', () => {
        expect(computeCMF([])).toEqual([]);
    });

    it('returns full-length array with defined values after warmup period', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 105, low: 95, close: 100, volume: 1000 }))
        );
        const result = computeCMF(candles, 20);
        // Full-length array (30) with first 19 entries undefined (warmup)
        expect(result.length).toBe(30);
        expect(result[0].value).toBeUndefined();
        expect(result[19].value).toBeDefined();
        result.slice(19).forEach(p => expect(p.value).toBeDefined());
    });

    it('CMF is positive when close is near high (accumulation)', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 110, low: 90, close: 108, volume: 1000 }))
        );
        const result = computeCMF(candles, 20);
        const lastValues = result.slice(-3);
        lastValues.forEach(p => expect(p.value).toBeGreaterThan(0));
    });

    it('CMF is negative when close is near low (distribution)', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 110, low: 90, close: 92, volume: 1000 }))
        );
        const result = computeCMF(candles, 20);
        const lastValues = result.slice(-3);
        lastValues.forEach(p => expect(p.value).toBeLessThan(0));
    });

    it('CMF is near zero for mid-range closes', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, () => ({ high: 110, low: 90, close: 100, volume: 1000 }))
        );
        const result = computeCMF(candles, 20);
        // MFM = ((close-low) - (high-close)) / range = ((100-90)-(110-100))/20 = 0
        // So CMF should be 0 everywhere after warmup (skip undefined warmup entries)
        result.filter(p => p.value !== undefined).forEach(p => expect(p.value).toBeCloseTo(0, 10));
    });

    it('different period produces different CMF values', () => {
        const candles = makeCandles(
            Array.from({ length: 40 }, (_, i) => ({ high: 105, low: 95, close: 100 + (i % 3 - 1) * 3, volume: 1000 }))
        );
        const result10 = computeCMF(candles, 10);
        const result20 = computeCMF(candles, 20);
        // Both return full-length arrays, but different first-defined indices
        expect(result10.length).toBe(40);
        expect(result20.length).toBe(40);
        const firstDefined10 = result10.findIndex(p => p.value !== undefined);
        const firstDefined20 = result20.findIndex(p => p.value !== undefined);
        expect(firstDefined10).toBeLessThan(firstDefined20);
    });

    it('CMF returns value between -1 and 1', () => {
        const candles = makeCandles(
            Array.from({ length: 30 }, (_, i) => ({
                high: 110,
                low: 90,
                close: 90 + (i % 2 === 0 ? 18 : 2),
                volume: 1000,
            }))
        );
        const result = computeCMF(candles, 20);
        // Skip undefined warmup entries (first 19)
        result.filter(p => p.value !== undefined).forEach(p => {
            expect(p.value).toBeGreaterThanOrEqual(-1);
            expect(p.value).toBeLessThanOrEqual(1);
        });
    });
});
