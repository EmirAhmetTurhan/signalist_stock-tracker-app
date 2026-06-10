import { describe, it, expect } from 'vitest';
import { computeSMI } from '@/lib/indicators/smi';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({
        time: i + 1,
        high: close + 2,
        low: close - 2,
        close,
    }));

describe('computeSMI', () => {
    it('returns empty array for empty input', () => {
        expect(computeSMI([], 14, 3, 3)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeSMI(c, 14, 3, 3)).toHaveLength(100);
    });

    it('smi and signal are defined after warmup with oscillating prices', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r = computeSMI(c, 14, 3, 3);
        const last = r[r.length - 1];
        expect(typeof last.smi).toBe('number');
        expect(typeof last.signal).toBe('number');
    });

    it('smi is positive in uptrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 2));
        const r = computeSMI(c, 14, 3, 3);
        const last = r[r.length - 1];
        expect(last.smi!).toBeGreaterThan(0);
    });

    it('smi is negative in downtrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 300 - i * 2));
        const r = computeSMI(c, 14, 3, 3);
        const last = r[r.length - 1];
        expect(last.smi!).toBeLessThan(0);
    });

    it('different long period produces different smi values', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r14 = computeSMI(c, 14, 3, 3);
        const r7 = computeSMI(c, 7, 3, 3);
        expect(r14[r14.length - 1].smi).not.toBe(r7[r7.length - 1].smi);
    });
});
