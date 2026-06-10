import { describe, it, expect } from 'vitest';
import { computeMFI } from '@/lib/indicators/mfi';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({
        time: i + 1, high: close + 2, low: close - 2, close, volume: 1000,
    }));

describe('computeMFI', () => {
    it('returns empty array for empty input', () => {
        expect(computeMFI([], 14)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeMFI(c, 14)).toHaveLength(100);
    });

    it('returns defined MFI values after warmup period', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeMFI(c, 14);
        // MFI should be defined for bars after the period
        const definedCount = r.filter(p => typeof p.mfi === 'number').length;
        expect(definedCount).toBeGreaterThan(0);
    });

    it('MFI is above 50 in upward trending market', () => {
        const c = makeCandles(Array.from({ length: 80 }, (_, i) => 100 + i * 1.5));
        const r = computeMFI(c, 14);
        const last = r[r.length - 1];
        expect(last.mfi).toBeGreaterThan(50);
    });

    it('MFI is below 50 in downward trending market', () => {
        const c = makeCandles(Array.from({ length: 80 }, (_, i) => 200 - i * 1.5));
        const r = computeMFI(c, 14);
        const last = r[r.length - 1];
        expect(last.mfi).toBeLessThan(50);
    });

    it('different periods produce different MFI values', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r14 = computeMFI(c, 14);
        const r7 = computeMFI(c, 7);
        expect(r14[r14.length - 1].mfi).not.toBe(r7[r7.length - 1].mfi);
    });
});
