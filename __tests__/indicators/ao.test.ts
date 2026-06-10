import { describe, it, expect } from 'vitest';
import { computeAO } from '@/lib/indicators/ao';

const makeCandles = (prices: { high: number; low: number }[]) =>
    prices.map((p, i) => ({ time: i + 1, high: p.high, low: p.low }));

describe('computeAO', () => {
    it('returns empty array for empty input', () => {
        expect(computeAO([])).toEqual([]);
    });

    it('returns same-length array with undefined warmup entries, then defined values after index 33', () => {
        const candles = makeCandles(
            Array.from({ length: 40 }, (_, i) => ({ high: 100 + i, low: 90 + i }))
        );
        const result = computeAO(candles);
        // Returns full-length array (sma34 first defined at index 33)
        expect(result.length).toBe(40);
        // First 33 entries are undefined (warmup)
        expect(result[0].value).toBeUndefined();
        expect(result[33].value).toBeDefined();
        expect(result[33].time).toBe(34);
    });

    it('value grows in strong uptrend', () => {
        const candles = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 100 + i * 2, low: 90 + i * 2 }))
        );
        const result = computeAO(candles);
        // In strong uptrend: sma5 > sma34 → AO positive
        const lastValues = result.slice(-5).filter(p => p.value !== undefined);
        lastValues.forEach(p => expect(p.value!).toBeGreaterThan(0));
    });

    it('value shrinks in strong downtrend', () => {
        const candles = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 200 - i * 2, low: 190 - i * 2 }))
        );
        const result = computeAO(candles);
        const lastValues = result.slice(-5).filter(p => p.value !== undefined);
        lastValues.forEach(p => expect(p.value!).toBeLessThan(0));
    });

    it('color is green when value increases from previous', () => {
        // Generate data where AO increases
        const candles = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 100 + i + (i < 35 ? 0 : i * 3), low: 90 + i + (i < 35 ? 0 : i * 3) }))
        );
        const result = computeAO(candles);
        // Skip first result (has no previous) and undefined entries
        for (let i = 1; i < result.length; i++) {
            if (result[i].value === undefined || result[i - 1].value === undefined) continue;
            if (result[i].value! > result[i - 1].value!) {
                expect(result[i].color).toBe('#0db27a');
            }
        }
    });

    it('color is red when value decreases from previous', () => {
        const candles = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 200 - i, low: 190 - i }))
        );
        const result = computeAO(candles);
        for (let i = 1; i < result.length; i++) {
            if (result[i].value === undefined || result[i - 1].value === undefined) continue;
            if (result[i].value! < result[i - 1].value!) {
                expect(result[i].color).toBe('#ef4444');
            }
        }
    });

    it('different price trends produce different AO values', () => {
        // Uptrend → AO positive
        const candles1 = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 100 + i * 2, low: 95 + i * 2 }))
        );
        // Downtrend → AO negative
        const candles2 = makeCandles(
            Array.from({ length: 50 }, (_, i) => ({ high: 200 - i * 2, low: 195 - i * 2 }))
        );
        const result1 = computeAO(candles1);
        const result2 = computeAO(candles2);
        const defined1 = result1.filter(p => p.value !== undefined);
        const defined2 = result2.filter(p => p.value !== undefined);
        const avg1 = defined1.reduce((s, p) => s + p.value!, 0) / defined1.length;
        const avg2 = defined2.reduce((s, p) => s + p.value!, 0) / defined2.length;
        // Uptrend average > downtrend average
        expect(avg1).toBeGreaterThan(avg2);
    });
});
