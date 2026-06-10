import { describe, it, expect } from 'vitest';
import { computeMACD } from '@/lib/indicators/macd';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({ time: i + 1, close }));

describe('computeMACD', () => {
    it('returns empty array for empty input', () => {
        expect(computeMACD([])).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 2));
        expect(computeMACD(c, 12, 26, 9)).toHaveLength(100);
    });

    it('macd, signal, histogram are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        const r = computeMACD(c, 12, 26, 9);
        const last = r[r.length - 1];
        expect(typeof last.macd).toBe('number');
        expect(typeof last.signal).toBe('number');
        expect(typeof last.histogram).toBe('number');
    });

    it('MACD is positive in strong uptrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 3));
        const r = computeMACD(c, 12, 26, 9);
        const last = r[r.length - 1];
        expect(last.macd!).toBeGreaterThan(0);
    });

    it('MACD is negative in strong downtrend', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 300 - i * 3));
        const r = computeMACD(c, 12, 26, 9);
        const last = r[r.length - 1];
        expect(last.macd!).toBeLessThan(0);
    });

    it('different fast values produce different MACD', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const fast12 = computeMACD(c, 12, 26, 9);
        const fast20 = computeMACD(c, 20, 26, 9);
        expect(fast12[fast12.length - 1].macd).not.toBe(fast20[fast20.length - 1].macd);
    });
});
