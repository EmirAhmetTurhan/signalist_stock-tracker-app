import { describe, it, expect } from 'vitest';
import { computeMADR } from './madr';

const makeCandles = (prices: number[]) =>
    prices.map((c, i) => ({ time: i + 1, close: c }));

describe('computeMADR', () => {
    it('returns empty array for empty input', () => {
        expect(computeMADR([])).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
        expect(computeMADR(candles).length).toBe(30);
    });

    it('returns undefined before SMA warmup', () => {
        const candles = makeCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
        const result = computeMADR(candles, 21);
        // All bars before SMA warmup (period-1 = 20) should be undefined
        for (let i = 0; i < result.length; i++) {
            expect(result[i].value).toBeUndefined();
        }
    });

    it('MADR is positive when close is above SMA', () => {
        // Rising prices: close > SMA
        const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
        const result = computeMADR(candles, 21);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => expect(p.value).toBeGreaterThan(0));
    });

    it('MADR is negative when close is below SMA', () => {
        // Falling prices: close < SMA
        const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 200 - i));
        const result = computeMADR(candles, 21);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => expect(p.value).toBeLessThan(0));
    });

    it('MADR near zero for flat prices', () => {
        const candles = makeCandles(Array.from({ length: 30 }, () => 100));
        const result = computeMADR(candles, 21);
        const lastValues = result.slice(-5);
        lastValues.forEach(p => expect(p.value).toBeCloseTo(0, 10));
    });

    it('different period produces different values', () => {
        const candles = makeCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
        const result10 = computeMADR(candles, 10);
        const result21 = computeMADR(candles, 21);
        const sum10 = result10.slice(-5).reduce((s, p) => s + p.value, 0);
        const sum21 = result21.slice(-5).reduce((s, p) => s + p.value, 0);
        expect(Math.abs(sum10 - sum21)).toBeGreaterThan(0.01);
    });
});
