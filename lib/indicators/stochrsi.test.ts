import { describe, it, expect } from 'vitest';
import { computeStochRSI } from '@/lib/indicators/stochrsi';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({ time: i + 1, close }));

describe('computeStochRSI', () => {
    it('returns empty array for empty input', () => {
        expect(computeStochRSI([], 14, 14, 3, 3)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeStochRSI(c, 14, 14, 3, 3)).toHaveLength(100);
    });

    it('k and d values are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeStochRSI(c, 14, 14, 3, 3);
        const last = r[r.length - 1];
        expect(typeof last.k).toBe('number');
        expect(typeof last.d).toBe('number');
    });

    it('k and d values are between 0 and 100 (with floating-point tolerance)', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r = computeStochRSI(c, 14, 14, 3, 3);
        const eps = 1e-9;
        for (let i = 20; i < r.length; i++) {
            if (typeof r[i].k === 'number') {
                expect(r[i].k!).toBeGreaterThanOrEqual(0 - eps);
                expect(r[i].k!).toBeLessThanOrEqual(100 + eps);
            }
            if (typeof r[i].d === 'number') {
                expect(r[i].d!).toBeGreaterThanOrEqual(0 - eps);
                expect(r[i].d!).toBeLessThanOrEqual(100 + eps);
            }
        }
    });

    it('different rsiLen produces different k values', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r14 = computeStochRSI(c, 14, 14, 3, 3);
        const r7 = computeStochRSI(c, 7, 14, 3, 3);
        expect(r14[r14.length - 1].k).not.toBe(r7[r7.length - 1].k);
    });
});
