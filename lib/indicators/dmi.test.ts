import { describe, it, expect } from 'vitest';
import { computeDMI } from '@/lib/indicators/dmi';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({
        time: i + 1, high: close + 2, low: close - 2, close,
    }));

describe('computeDMI', () => {
    it('returns empty array for empty input', () => {
        expect(computeDMI([], 14, 14)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeDMI(c, 14, 14)).toHaveLength(100);
    });

    it('plusDI, minusDI, adx are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeDMI(c, 14, 14);
        const last = r[r.length - 1];
        expect(typeof last.plusDI).toBe('number');
        expect(typeof last.minusDI).toBe('number');
        expect(typeof last.adx).toBe('number');
    });

    it('plusDI is above minusDI in uptrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 2));
        const r = computeDMI(c, 14, 14);
        const last = r[r.length - 1];
        expect(last.plusDI!).toBeGreaterThan(last.minusDI!);
    });

    it('minusDI is above plusDI in downtrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 300 - i * 2));
        const r = computeDMI(c, 14, 14);
        const last = r[r.length - 1];
        expect(last.minusDI!).toBeGreaterThan(last.plusDI!);
    });

    it('ADX is between 0 and 100', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r = computeDMI(c, 14, 14);
        for (let i = 30; i < r.length; i++) {
            if (typeof r[i].adx === 'number') {
                expect(r[i].adx!).toBeGreaterThanOrEqual(0);
                expect(r[i].adx!).toBeLessThanOrEqual(100);
            }
        }
    });
});
