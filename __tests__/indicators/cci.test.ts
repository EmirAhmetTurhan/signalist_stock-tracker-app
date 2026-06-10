import { describe, it, expect } from 'vitest';
import { computeCCI } from '@/lib/indicators/cci';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({
        time: i + 1, high: close + 2, low: close - 2, close,
    }));

describe('computeCCI', () => {
    it('returns empty array for empty input', () => {
        expect(computeCCI([], 14)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeCCI(c, 14, 14)).toHaveLength(100);
    });

    it('CCI and MA are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeCCI(c, 14, 14);
        const last = r[r.length - 1];
        expect(typeof last.cci).toBe('number');
        expect(typeof last.ma).toBe('number');
    });

    it('CCI is positive in strong uptrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 2));
        const r = computeCCI(c, 14, 14);
        expect(r[r.length - 1].cci!).toBeGreaterThan(0);
    });

    it('CCI is negative in strong downtrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 300 - i * 2));
        const r = computeCCI(c, 14, 14);
        expect(r[r.length - 1].cci!).toBeLessThan(0);
    });

    it('different period produces different CCI values', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r14 = computeCCI(c, 14, 14);
        const r7 = computeCCI(c, 7, 14);
        expect(r14[r14.length - 1].cci).not.toBe(r7[r7.length - 1].cci);
    });
});
